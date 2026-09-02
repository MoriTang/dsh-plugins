/**
 * Tool-call audit + slow-call monitor.
 *
 * Host half: wraps `tools/execute` (the around-dispatch waterfall) to measure
 * every model tool call's wall duration and settle outcome, keeps a bounded
 * per-session ledger in memory, optionally aborts calls that exceed a
 * configured hard budget, and serves `/tool-audit/recent` for the browser
 * half's composer-dock readout.
 *
 * Design notes:
 * - Durations need wall-clock timing, so this rides the LIVE `tools/execute`
 *   wrapper, not a session-log projection (log events carry no timestamps).
 * - The harness already enforces per-tool declared `timeoutMs` budgets
 *   (`@deepseek-ai/dsh-tool-call-timeout-policy`); this plugin does NOT
 *   duplicate that. `abortAfterMs` is an optional blanket safety net for
 *   tools that declare no budget, off by default.
 * - Audit data is deliberately NOT model-visible: nothing here appends to the
 *   session log, so it never pollutes the model's context.
 */

import type { Context } from '@deepseek-ai/cordis'
import type { IncomingMessage, ServerResponse } from 'node:http'
// Type-only: pulls the webServer Context merge and its WebRoute type.
import type {} from '@deepseek-ai/dsh-host-webserver'
// Type-only: pulls the tools service merge (ctx.tools) and the tools event map.
import type {} from '@deepseek-ai/dsh-tools'
import type { ToolDispatchExecution, ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import { z } from 'zod'
import {
  argsPreview,
  classifyOutcome,
  ToolAuditLedger,
  type ToolAuditRecord,
} from './audit-core.ts'

export interface Config {
  /** Calls at or above this many milliseconds are flagged `slow` in the ledger. */
  slowThresholdMs: number
  /**
   * Optional blanket budget: when set, any tool call exceeding it is aborted
   * and its result replaced with a `TOOL_AUDIT_TIMEOUT` error. Undefined (the
   * default) records only. Harness-declared per-tool `timeoutMs` budgets are
   * enforced by the shipped timeout policy regardless of this setting.
   */
  abortAfterMs?: number
  /** Newest calls kept per session id. */
  maxPerSession: number
  /** Newest calls kept across all sessions. */
  maxTotal: number
}

export const Config: z.ZodType<Config> = z.object({
  slowThresholdMs: z.number().int().positive().default(60_000),
  abortAfterMs: z.number().int().positive().optional(),
  maxPerSession: z.number().int().positive().default(100),
  maxTotal: z.number().int().positive().default(1_000),
})

/** The plugin's own structured timeout error code (routable by retry/sandbox plugins). */
export const TOOL_AUDIT_TIMEOUT = 'TOOL_AUDIT_TIMEOUT'

export const name = 'tool-audit'
export const inject = ['tools', 'webServer']

/** Agent-less callers (SDK/headless) share one bucket so they stay visible. */
const HOST_BUCKET = '(host)'

function json(res: ServerResponse, value: unknown): void {
  res.setHeader('content-type', 'application/json')
  res.end(JSON.stringify(value))
}

/** The structured result substituted when this plugin's own budget wins. */
function auditTimeoutResult(timeoutMs: number): ToolExecutionResult {
  const message = `tool call exceeded the audit deadline of ${timeoutMs}ms`
  return {
    content: [{ type: 'text', text: `Error: ${message}` }],
    isError: true,
    error: { message, info: { name: 'ToolAuditTimeoutError', code: TOOL_AUDIT_TIMEOUT } },
  }
}

/**
 * Arm a deadline signal over the caller's own signal. When the caller cancels
 * first the deadline is disarmed (the run is over; nothing left to time out).
 * Returns `won()` so the wrapper can tell whether THIS deadline fired.
 */
function armDeadline(
  upstream: AbortSignal,
  ms: number,
): { signal: AbortSignal; won: () => boolean; dispose: () => void } {
  const controller = new AbortController()
  let ours = false
  let finished = false
  let timer: ReturnType<typeof setTimeout> | undefined

  const onUpstream = (): void => {
    if (finished) return
    finished = true
    if (timer !== undefined) clearTimeout(timer)
    upstream.removeEventListener('abort', onUpstream)
    controller.abort(upstream.reason)
  }
  const onTimer = (): void => {
    if (finished) return
    finished = true
    ours = true
    upstream.removeEventListener('abort', onUpstream)
    controller.abort(new Error(`tool-audit: ${ms}ms deadline exceeded`))
  }

  if (upstream.aborted) {
    controller.abort(upstream.reason)
    finished = true
  } else {
    upstream.addEventListener('abort', onUpstream, { once: true })
    timer = setTimeout(onTimer, ms)
  }

  return {
    signal: controller.signal,
    won: () => ours,
    dispose: () => {
      if (timer !== undefined && !finished) {
        finished = true
        clearTimeout(timer)
        upstream.removeEventListener('abort', onUpstream)
      }
      if (!controller.signal.aborted) controller.abort()
    },
  }
}

/** The one error code a thrown wrapper sees; failures usually arrive as results. */
function errorCodeOf(result: ToolExecutionResult | undefined, error: unknown): string | null {
  if (result !== undefined && result.isError) {
    const info = result.error.info
    if (info !== undefined && typeof info === 'object') {
      const { name, code } = info as { name?: string; code?: unknown }
      return code !== undefined ? String(code) : name ?? 'error'
    }
    return 'error'
  }
  return error instanceof Error ? error.name : error === undefined ? null : 'error'
}

/**
 * Host half: record every model tool call (duration, settle outcome, slow
 * flag) into a bounded per-session ledger and serve `/tool-audit/recent`.
 */
export function apply(ctx: Context, config: Config): void {
  const ledger = new ToolAuditLedger({
    maxPerSession: config.maxPerSession,
    maxTotal: config.maxTotal,
  })

  ctx.on('tools/execute', async (
    exec: ToolDispatchExecution,
    next: () => Promise<ToolExecutionResult>,
  ): Promise<ToolExecutionResult> => {
    const sessionId = exec.agent === undefined ? HOST_BUCKET : String(exec.agent.id)
    const startedAt = Date.now()
    const startedMs = performance.now()

    // Optional blanket budget. The caller's own signal is restored before any
    // later listener (post-execute) or the tool body sees teardown.
    const upstream = exec.signal
    const deadline = config.abortAfterMs === undefined
      ? undefined
      : armDeadline(upstream, config.abortAfterMs)
    if (deadline !== undefined) exec.signal = deadline.signal

    let result: ToolExecutionResult | undefined
    let error: unknown
    try {
      result = await next()
    } catch (caught: unknown) {
      error = caught
    } finally {
      if (deadline !== undefined) {
        exec.signal = upstream
        deadline.dispose()
      }
    }

    const durationMs = performance.now() - startedMs
    const timedOut = deadline?.won() === true
    if (timedOut && result !== undefined) {
      // The tool/capability saw our abort and settled; replace whatever it
      // returned (its own abort result) with the structured error the model
      // sees, mirroring the shipped timeout policy.
      result = auditTimeoutResult(config.abortAfterMs as number)
    }

    const outcome = classifyOutcome({
      isError: result?.isError === true || error !== undefined,
      errorCode: errorCodeOf(result, error),
      callerAborted: !timedOut && upstream.aborted,
      timedOut,
    })

    ledger.push({
      sessionId,
      callId: String(exec.callId),
      name: exec.name,
      argsPreview: argsPreview(exec.arguments),
      startedAt,
      durationMs,
      outcome,
      errorCode: outcome === 'error' || outcome === 'timeout' ? errorCodeOf(result, error) : null,
      slow: durationMs >= config.slowThresholdMs,
    })

    if (error !== undefined) throw error
    return result as ToolExecutionResult
  })

  const recentHandler = (req: IncomingMessage, res: ServerResponse): void => {
    const url = new URL(req.url ?? '/', 'http://dsh.local')
    const session = url.searchParams.get('session') ?? undefined
    const rawLimit = Number(url.searchParams.get('limit') ?? 0)
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), 500) : 0
    const entries: ToolAuditRecord[] = ledger.recent(session, limit)
    json(res, {
      meta: { slowThresholdMs: config.slowThresholdMs },
      entries,
    })
  }
  ctx.effect(
    () => ctx.webServer.register({ kind: 'exact', path: '/tool-audit/recent', handler: recentHandler }),
    'tool-audit: recent route',
  )
}

/**
 * Tool-call audit + slow-call monitor.
 *
 * Host half: measures every DISPATCHED model tool call's wall duration in the
 * `tools/execute` around-dispatch waterfall (where timing is observable and an
 * optional blanket abort deadline can swap `exec.signal`), then commits each
 * record from the `tools/result` observer — the authoritative, frozen outcome
 * AFTER wrapper normalization, caller cancellation, and `tools/post-execute`
 * replacement. Tools denied before around-dispatch never dispatch and are out
 * of scope (they settle without a `tools/execute` pass).
 *
 * Design notes:
 * - Durations need wall-clock timing, so the timing half rides the LIVE
 *   `tools/execute` wrapper; committing from `tools/result` keeps the ledger
 *   truthful about what actually settled (shipped `TOOL_TIMEOUT` replacements,
 *   post-execute changes, harness cancellation codes like `ABORTED`).
 * - The harness already enforces per-tool declared `timeoutMs` budgets
 *   (`@deepseek-ai/dsh-tool-call-timeout-policy`). `abortAfterMs` is an OPTIONAL
 *   cooperative safety net applied ONLY to tools that declare no budget.
 * - Audit data is deliberately NOT model-visible: nothing here appends to the
 *   session log, so it never pollutes the model's context.
 */

import type { Context } from '@deepseek-ai/cordis'
import type { IncomingMessage, ServerResponse } from 'node:http'
// Type-only: pulls the webServer Context merge and its WebRoute type.
import type {} from '@deepseek-ai/dsh-host-webserver'
// Type-only: pulls the tools service merge (ctx.tools) and the tools event map.
import type {} from '@deepseek-ai/dsh-tools'
import type { ToolDispatchExecution, ToolExecutionResult, ToolExecution } from '@deepseek-ai/dsh-tools'
import { z } from 'zod'
import {
  argsPreview,
  classifyOutcome,
  TOOL_AUDIT_TIMEOUT,
  ToolAuditLedger,
  type ToolAuditRecord,
} from './audit-core.ts'

export { TOOL_AUDIT_TIMEOUT }

/** Node's setTimeout caps at 2^31-1 ms (~24.8 days); beyond that it clamps to ~1 ms. */
export const MAX_TIMEOUT_MS = 2_147_483_647

export interface Config {
  /** Calls at or above this many milliseconds are flagged `slow` in the ledger. */
  slowThresholdMs: number
  /**
   * Optional cooperative blanket budget for tools that declare NO `timeoutMs`
   * of their own: when set, such a call exceeding it is aborted (its result
   * replaced with a `TOOL_AUDIT_TIMEOUT` error). Tools that declare their own
   * budget are left to the shipped timeout policy. Default: off.
   */
  abortAfterMs?: number
  /** Newest calls kept per session id. */
  maxPerSession: number
  /** Newest calls kept across all sessions. */
  maxTotal: number
}

export const Config: z.ZodType<Config> = z.object({
  slowThresholdMs: z.number().int().positive().default(60_000),
  abortAfterMs: z.number().int().positive().max(MAX_TIMEOUT_MS).optional(),
  maxPerSession: z.number().int().positive().default(100),
  maxTotal: z.number().int().positive().default(1_000),
})

export const name = 'tool-audit'
export const inject = ['tools', 'webServer']

/** Agent-less callers (SDK/headless) share one bucket so they stay visible. */
const HOST_BUCKET = '(host)'

/** Default/safe route limit; malformed input is rejected, never widened. */
const DEFAULT_LIMIT = 50
const MAX_LIMIT = 500

function json(res: ServerResponse, value: unknown, status = 200): void {
  res.statusCode = status
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

/** Structured error code of an authoritative result, when it carries one. */
function errorCodeOf(result: ToolExecutionResult): string | null {
  if (!result.isError) return null
  const info = result.error.info
  if (info !== undefined && typeof info === 'object') {
    const { name, code } = info as { name?: string; code?: unknown }
    return code !== undefined ? String(code) : name ?? null
  }
  return null
}

/** Timing facts stashed by the execute wrapper until the authoritative result lands. */
interface PendingAudit {
  readonly sessionId: string
  readonly callId: string
  readonly name: string
  readonly argsPreview: string
  readonly startedAt: number
  durationMs: number
  timedOut: boolean
}

/**
 * Host half: time every dispatched model tool call in `tools/execute`, and
 * commit each record in `tools/result` from the authoritative settle outcome.
 * Serves `/tool-audit/recent` (per-session) for the browser half's dock.
 */
export function apply(ctx: Context, config: Config): void {
  const ledger = new ToolAuditLedger({
    maxPerSession: config.maxPerSession,
    maxTotal: config.maxTotal,
  })
  // In-flight timing stash keyed by execution token; consumed by tools/result.
  const pending = new Map<symbol, PendingAudit>()
  // Bounded: a call that never settles (uncooperative tool + teardown) would
  // otherwise leak. Evict entries older than 10 minutes when adding new ones.
  const STALE_MS = 10 * 60_000

  ctx.on('tools/execute', async (
    exec: ToolDispatchExecution,
    next: () => Promise<ToolExecutionResult>,
  ): Promise<ToolExecutionResult> => {
    const startedAt = Date.now()
    const startedMs = performance.now()
    const sessionId = exec.agent === undefined ? HOST_BUCKET : String(exec.agent.id)

    // Optional blanket budget: only for tools that declare no timeoutMs of
    // their own — declared budgets belong to the shipped timeout policy, and
    // double deadlines would race each other.
    const declaredBudget = ctx.tools.get(exec.name, exec.agent)?.timeoutMs
    const upstream = exec.signal
    const deadline = config.abortAfterMs === undefined || declaredBudget !== undefined
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

    // Stash timing; the AUTHORITATIVE outcome is committed at tools/result.
    for (const [token, entry] of pending) {
      if (startedAt - entry.startedAt > STALE_MS) pending.delete(token)
    }
    if (pending.size < 1_000) {
      pending.set(exec.token, {
        sessionId,
        callId: String(exec.callId),
        name: exec.name,
        argsPreview: argsPreview(exec.arguments),
        startedAt,
        durationMs,
        timedOut,
      })
    }

    if (error !== undefined) throw error
    return result as ToolExecutionResult
  })

  ctx.on('tools/result', (exec: Readonly<ToolExecution>, result: Readonly<ToolExecutionResult>) => {
    const timing = pending.get(exec.token)
    if (timing === undefined) return // not dispatched through our wrapper
    pending.delete(exec.token)

    const errorCode = errorCodeOf(result as ToolExecutionResult)
    const outcome = classifyOutcome({
      isError: result.isError,
      errorCode,
      timedOut: timing.timedOut,
    })
    ledger.push({
      sessionId: timing.sessionId,
      callId: timing.callId,
      name: timing.name,
      argsPreview: timing.argsPreview,
      startedAt: timing.startedAt,
      durationMs: timing.durationMs,
      outcome,
      errorCode,
      slow: timing.durationMs >= config.slowThresholdMs,
    })
  })

  const recentHandler = (req: IncomingMessage, res: ServerResponse): void => {
    const url = new URL(req.url ?? '/', 'http://dsh.local')
    const session = url.searchParams.get('session')
    // The UI endpoint is per-session: argument previews may be sensitive, so
    // refuse to enumerate every session's records.
    if (session === null || session === '') {
      json(res, { error: 'session query parameter is required' }, 400)
      return
    }
    const rawLimit = url.searchParams.get('limit')
    let limit = DEFAULT_LIMIT
    if (rawLimit !== null) {
      if (!/^[1-9][0-9]*$/.test(rawLimit)) {
        json(res, { error: 'limit must be a positive integer' }, 400)
        return
      }
      limit = Math.min(Number(rawLimit), MAX_LIMIT)
    }
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

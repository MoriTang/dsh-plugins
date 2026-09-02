/**
 * Pure tool-call audit core: outcome classification, the bounded per-session
 * ledger, and small display helpers. Framework-free on purpose — every import
 * here is type-only or builtin, so the file is unit-testable with node:test
 * and shareable between the host half (recording) and the browser half
 * (duration formatting).
 */

/** Settled outcome of one tool call. Precedence: timeout > aborted > error > ok. */
export type ToolOutcome = 'ok' | 'error' | 'aborted' | 'timeout'

/** This plugin's own deadline error code (mirrors the shipped policy's TOOL_TIMEOUT). */
export const TOOL_AUDIT_TIMEOUT = 'TOOL_AUDIT_TIMEOUT'

/**
 * Structured error codes classified as a timeout. `TOOL_TIMEOUT` is the shipped
 * `@deepseek-ai/dsh-tool-call-timeout-policy` code; `TOOL_AUDIT_TIMEOUT` is this
 * plugin's own blanket-deadline code. Retry/sandbox plugins may mint others —
 * those stay plain `error`.
 */
export const TIMEOUT_CODES: ReadonlySet<string> = new Set(['TOOL_TIMEOUT', TOOL_AUDIT_TIMEOUT])

/** Canonical cancellation codes the harness substitutes on caller/turn abort. */
export const ABORT_CODES: ReadonlySet<string> = new Set(['ABORTED', 'ABORTED_BEFORE_DISPATCH'])

/** One recorded tool call. Immutable after {@link ToolAuditLedger.push}. */
export interface ToolAuditRecord {
  /** Monotonic ledger sequence; larger means newer. */
  readonly seq: number
  /** Delegating agent's session id, or `(host)` for agent-less calls. */
  readonly sessionId: string
  readonly callId: string
  readonly name: string
  /** Truncated lossless-JSON argument preview (model-visible arguments only). */
  readonly argsPreview: string
  /** Epoch milliseconds when dispatch started. */
  readonly startedAt: number
  /** Wall-clock dispatch duration in milliseconds. */
  readonly durationMs: number
  readonly outcome: ToolOutcome
  /** Structured error code (e.g. `TOOL_TIMEOUT`, `TOOL_AUDIT_TIMEOUT`, `FS_NOT_FOUND`), when the result carried one. */
  readonly errorCode: string | null
  /** Whether the call crossed the configured slow threshold. */
  readonly slow: boolean
}

/** Inputs the wrapper derives at settle; pure so classification is testable. */
export interface OutcomeInput {
  readonly isError: boolean
  /** Structured error code of the authoritative result, when present. */
  readonly errorCode: string | null | undefined
  /** This plugin's own deadline fired (belt-and-braces alongside the code). */
  readonly timedOut: boolean
}

/**
 * Classify the AUTHORITATIVE settle outcome. Our deadline or a known timeout
 * code wins; then harness cancellation codes; then any other error; else ok.
 */
export function classifyOutcome(input: OutcomeInput): ToolOutcome {
  if (input.timedOut || (input.errorCode !== null && input.errorCode !== undefined
    && TIMEOUT_CODES.has(input.errorCode))) return 'timeout'
  if (input.errorCode !== null && input.errorCode !== undefined
    && ABORT_CODES.has(input.errorCode)) return 'aborted'
  if (input.isError) return 'error'
  return 'ok'
}

export interface LedgerOptions {
  /** Newest calls kept per session id. */
  readonly maxPerSession: number
  /** Newest calls kept across all sessions. */
  readonly maxTotal: number
}

/**
 * Bounded, insertion-ordered audit ledger keyed by session id. Oldest entries
 * are dropped first when a cap is exceeded; `seq` is never reused.
 */
export class ToolAuditLedger {
  private records: ToolAuditRecord[] = []
  private counter = 0

  constructor(private readonly options: LedgerOptions) {}

  get size(): number {
    return this.records.length
  }

  /** Append one settled call, assign its seq, and trim to the caps. */
  push(entry: Omit<ToolAuditRecord, 'seq'>): ToolAuditRecord {
    const record: ToolAuditRecord = { ...entry, seq: ++this.counter }
    this.records.push(record)

    // Per-session cap: drop the oldest entries of the SAME session first so
    // one chatty session cannot evict another session's history wholesale.
    if (this.options.maxPerSession > 0) {
      const sessionCount = this.records.filter(r => r.sessionId === record.sessionId).length
      const excess = sessionCount - this.options.maxPerSession
      if (excess > 0) {
        let dropped = 0
        this.records = this.records.filter(r => {
          if (dropped >= excess) return true
          if (r.sessionId !== record.sessionId) return true
          dropped += 1
          return false
        })
      }
    }

    if (this.records.length > this.options.maxTotal) {
      const overflow = this.records.length - this.options.maxTotal
      this.records.splice(0, overflow)
    }
    return record
  }

  /**
   * Newest-first entries for one session.
   * @param sessionId - session filter; `undefined` returns every session.
   * @param limit - maximum entries returned; `<= 0` or absent means all.
   */
  recent(sessionId: string | undefined, limit = 0): ToolAuditRecord[] {
    const filtered = sessionId === undefined
      ? this.records
      : this.records.filter(r => r.sessionId === sessionId)
    const slice = limit > 0 ? filtered.slice(-limit) : filtered
    return slice.slice().reverse()
  }

  /** Drop all entries (seq keeps counting, so ids are never reused). */
  clear(): void {
    this.records = []
  }
}

/** Compact lossless-JSON preview of parsed tool arguments. */
export function argsPreview(value: unknown, maxChars = 160): string {
  let text: string
  try {
    text = JSON.stringify(value)
  } catch {
    text = String(value)
  }
  if (text === undefined) text = String(value)
  if (text.length <= maxChars) return text
  const head = Math.ceil(maxChars * 0.6)
  const tail = maxChars - head - 1
  return `${text.slice(0, head)}…${text.slice(-tail)}`
}

/** Compact wall duration: `412ms`, `1.2s`, `3m5s` (no `60.0s`/`3m60s` artifacts). */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '0ms'
  if (ms < 1_000) return `${Math.round(ms)}ms`
  if (ms < 60_000) {
    const tenths = Math.round(ms / 100)
    if (tenths >= 600) return '1m0s'
    return `${(tenths / 10).toFixed(1)}s`
  }
  let minutes = Math.floor(ms / 60_000)
  let seconds = Math.round((ms % 60_000) / 1_000)
  if (seconds === 60) {
    minutes += 1
    seconds = 0
  }
  return `${minutes}m${seconds}s`
}

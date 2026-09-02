/**
 * Pure tool-call audit core: outcome classification, the bounded per-session
 * ledger, and small display helpers. Framework-free on purpose — every import
 * here is type-only or builtin, so the file is unit-testable with node:test
 * and shareable between the host half (recording) and the browser half
 * (duration formatting).
 */

/** Settled outcome of one tool call. Precedence: timeout > aborted > error > ok. */
export type ToolOutcome = 'ok' | 'error' | 'aborted' | 'timeout'

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
  /** Structured error code (e.g. `TOOL_TIMEOUT`, `TOOL_AUDIT_TIMEOUT`), when failed. */
  readonly errorCode: string | null
  /** Whether the call crossed the configured slow threshold. */
  readonly slow: boolean
}

/** Inputs the wrapper derives at settle; pure so classification is testable. */
export interface OutcomeInput {
  readonly isError: boolean
  readonly errorCode: string | null | undefined
  /** Caller/turn cancellation observed at settle (the audit deadline did not fire). */
  readonly callerAborted: boolean
  /** The audit deadline fired and replaced the result. */
  readonly timedOut: boolean
}

/** Classify a settled call. Our deadline wins; then caller cancellation; then error. */
export function classifyOutcome(input: OutcomeInput): ToolOutcome {
  if (input.timedOut) return 'timeout'
  if (input.callerAborted) return 'aborted'
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
   * Newest-first entries, optionally filtered to one session.
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

/** Compact wall duration: `412ms`, `1.2s`, `3m5s`. */
export function formatDuration(ms: number): string {
  if (ms < 1_000) return `${Math.round(ms)}ms`
  const seconds = ms / 1_000
  if (seconds < 60) return `${seconds.toFixed(1)}s`
  const minutes = Math.floor(seconds / 60)
  return `${minutes}m${Math.round(seconds % 60)}s`
}

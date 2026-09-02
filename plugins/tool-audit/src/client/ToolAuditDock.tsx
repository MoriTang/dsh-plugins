import { memo, useEffect, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import {
  formatDuration,
  type ToolAuditRecord,
  type ToolOutcome,
} from '../audit-core.ts'

/** One `/tool-audit/recent` response. */
export interface ToolAuditRecentPayload {
  meta: { slowThresholdMs: number }
  entries: ToolAuditRecord[]
}

/**
 * Props: the composer-dock owner share (current session snapshot) that the
 * conversation shell passes at its renderSlot site. Declared structurally and
 * optional so an assembly that omits the owner degrades to "render nothing"
 * instead of throwing.
 */
export interface ToolAuditDockProps {
  session?: { readonly sessionId?: string }
}

const ROW_HEIGHT = 20
const MAX_ROWS = 8

const panelStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
  width: '100%',
  maxHeight: ROW_HEIGHT * Math.min(MAX_ROWS, 4) + 4,
  overflowY: 'auto',
  fontSize: '11px',
  lineHeight: `${ROW_HEIGHT}px`,
  fontFamily: 'var(--dsw-font-mono, monospace)',
  fontVariantNumeric: 'tabular-nums',
  color: 'var(--dsw-alias-label-tertiary)',
}

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  minWidth: 0,
}

const nameStyle: CSSProperties = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  flex: '0 1 auto',
}

const spacerStyle: CSSProperties = { flex: '1 1 auto' }

const durationStyle: CSSProperties = {
  flex: 'none',
  textAlign: 'right',
}

const tagStyle: CSSProperties = {
  flex: 'none',
  fontSize: '10px',
  lineHeight: '14px',
  padding: '0 4px',
  borderRadius: '4px',
}

function outcomeColor(outcome: ToolOutcome): string {
  switch (outcome) {
    case 'ok': return 'var(--dsw-alias-state-success-primary)'
    case 'error': return 'var(--dsw-static-red-500)'
    case 'timeout': return 'var(--dsw-static-amber-500)'
    case 'aborted': return 'var(--dsw-alias-label-tertiary)'
  }
}

function outcomeTag(outcome: ToolOutcome): string | null {
  switch (outcome) {
    case 'ok': return null
    case 'error': return 'err'
    case 'timeout': return 'timeout'
    case 'aborted': return 'abort'
  }
}

/** One row: status dot, tool name, optional tag, right-aligned duration. */
function AuditRow({ record }: { record: ToolAuditRecord }): ReactNode {
  const dot = (
    <span
      style={{
        flex: 'none',
        width: 6,
        height: 6,
        borderRadius: '50%',
        background: outcomeColor(record.outcome),
      }}
    />
  )
  const tag = outcomeTag(record.outcome)
  const slowDuration = record.slow
    ? { color: 'var(--dsw-static-amber-500)' }
    : undefined
  const detail = [
    `${record.name} (${record.outcome}${record.errorCode !== null ? ` · ${record.errorCode}` : ''})`,
    `call ${record.callId}`,
    `started ${new Date(record.startedAt).toLocaleTimeString()} · ran ${formatDuration(record.durationMs)}${record.slow ? ' · slow' : ''}`,
    record.argsPreview !== '' ? `args ${record.argsPreview}` : null,
  ].filter((line): line is string => line !== null).join('\n')

  return (
    <Tooltip label={detail} side="top" delayMs={400}>
      <div style={rowStyle}>
        {dot}
        <span style={nameStyle}>{record.name}</span>
        {tag !== null && (
          <span style={{ ...tagStyle, color: outcomeColor(record.outcome) }}>{tag}</span>
        )}
        <span style={spacerStyle} />
        <span style={{ ...durationStyle, ...slowDuration }}>{formatDuration(record.durationMs)}</span>
      </div>
    </Tooltip>
  )
}

/** Minimal shape guard so a malformed route response cannot crash rendering. */
function isRecentPayload(value: unknown): value is ToolAuditRecentPayload {
  if (typeof value !== 'object' || value === null) return false
  const payload = value as Partial<ToolAuditRecentPayload>
  return Array.isArray(payload.entries)
    && typeof payload.meta?.slowThresholdMs === 'number'
}

/**
 * Poll the host's per-session recent-call route. One request at a time: the
 * next poll is scheduled only after the current one settles, and the in-flight
 * fetch is aborted on unmount/session change.
 */
function useRecent(sessionId: string | undefined, intervalMs: number): ToolAuditRecentPayload | null {
  const [payload, setPayload] = useState<ToolAuditRecentPayload | null>(null)
  useEffect(() => {
    if (sessionId === undefined) return
    let cancelled = false
    let inFlight: AbortController | undefined
    let timer: ReturnType<typeof setTimeout> | undefined

    const poll = async (): Promise<void> => {
      inFlight = new AbortController()
      try {
        const res = await fetch(
          `/tool-audit/recent?session=${encodeURIComponent(sessionId)}&limit=${MAX_ROWS}`,
          { signal: inFlight.signal },
        )
        if (!res.ok) return
        const data: unknown = await res.json()
        if (!cancelled && isRecentPayload(data)) setPayload(data)
      } catch {
        // Abort (unmount) or transient failure: keep the previous value.
      } finally {
        inFlight = undefined
        if (!cancelled) timer = setTimeout(() => void poll(), intervalMs)
      }
    }
    void poll()
    return () => {
      cancelled = true
      inFlight?.abort()
      if (timer !== undefined) clearTimeout(timer)
    }
  }, [sessionId, intervalMs])
  return payload
}

/**
 * Composer-dock readout: the current session's recent tool calls with settle
 * outcome and wall duration. Polled from the host ledger (`/tool-audit/recent`)
 * because durations only exist live, not in the durable session log.
 */
export const ToolAuditDock = memo(function ToolAuditDock({ session }: ToolAuditDockProps) {
  const sessionId = session?.sessionId
  const payload = useRecent(sessionId, 1_200)
  const entries = payload?.entries ?? []
  if (entries.length === 0) return null
  return (
    <div style={panelStyle}>
      {entries.map(record => <AuditRow key={record.seq} record={record} />)}
    </div>
  )
})

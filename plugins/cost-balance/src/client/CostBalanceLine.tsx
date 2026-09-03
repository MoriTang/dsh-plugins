import { memo, useEffect, useState } from 'react'
import type { UseProjection } from '@deepseek-ai/dsh-api-session-controller/client'
import type { CostBalanceView } from '../projection.ts'

/** Props: the composer-dock standard kit (the projection reader) plus nothing else. */
export interface CostBalanceLineProps {
  useProjection: UseProjection
}

/** One balance line from the host route. */
export interface BalancePayload {
  balance: {
    is_available: boolean
    balance_infos: Array<{
      currency: 'CNY' | 'USD'
      total_balance: string
      granted_balance: string
      topped_up_balance: string
    }>
  } | null
  checkedAt: number
  lastError: string | null
}

/** Poll the host balance route. */
function useBalance(intervalMs: number): BalancePayload | null {
  const [payload, setPayload] = useState<BalancePayload | null>(null)
  useEffect(() => {
    let cancelled = false
    const poll = async (): Promise<void> => {
      try {
        const res = await fetch('/cost-balance/balance')
        if (!res.ok) return
        const data = (await res.json()) as BalancePayload
        if (!cancelled) setPayload(data)
      } catch {
        // Keep the previous value on transient failures.
      }
    }
    void poll()
    const timer = setInterval(() => void poll(), intervalMs)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [intervalMs])
  return payload
}

/** Compact money: 0.001234 → ¥0.0012 (4 sig figs, no trailing zeros). */
function formatMoney(cost: number, currency: string): string {
  if (cost === 0) return `${currency}0`
  if (cost >= 100) return `${currency}${cost.toFixed(2)}`
  if (cost >= 1) return `${currency}${cost.toFixed(3)}`
  // Sub-unit: keep 4 significant figures.
  const magnitude = Math.floor(Math.log10(cost))
  const digits = 3 - magnitude
  return `${currency}${cost.toFixed(Math.max(0, digits))}`
}

/** Compact token count, matching the stats line's format. */
function formatTokens(n: number): string {
  if (n < 1_000) return String(n)
  if (n < 1_000_000) return `${Math.round(n / 1_000)}K`
  return `${Math.round(n / 1_000_000)}M`
}

const rowStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '8px',
  color: 'var(--dsw-alias-label-tertiary)',
  fontSize: '12px',
  lineHeight: '18px',
  fontVariantNumeric: 'tabular-nums',
  fontFamily: 'var(--dsw-font-mono, monospace)',
}

const sepStyle: React.CSSProperties = {
  opacity: 0.5,
}

/**
 * Composer-dock readout: estimated session spend + account balance.
 * The spend comes from the `costBalance` projection (live, host-computed);
 * the balance is polled from the host route on an interval.
 */
export const CostBalanceLine = memo(function CostBalanceLine({ useProjection }: CostBalanceLineProps) {
  const view = useProjection('costBalance') as CostBalanceView | undefined
  const balance = useBalance(30_000)

  const groups: string[] = []
  if (view !== undefined && (view.inputTokens > 0 || view.outputTokens > 0 || view.cost > 0)) {
    groups.push(`cost ${formatMoney(view.cost, view.currency)}`)
    groups.push(`${formatTokens(view.inputTokens)} in · ${formatTokens(view.outputTokens)} out`)
  }
  const total = balance?.balance?.balance_infos.find(info => info.currency === 'CNY')
    ?? balance?.balance?.balance_infos[0]
  if (total !== undefined) {
    const symbol = total.currency === 'CNY' ? '¥' : '$'
    groups.push(`balance ${symbol}${total.total_balance}`)
  } else if (balance?.lastError !== null && balance?.lastError !== undefined) {
    groups.push('balance unavailable')
  }

  if (groups.length === 0) return null
  return (
    <span style={rowStyle}>
      {groups.map((group, i) => (
        <span key={group}>
          {i > 0 && <span style={sepStyle}> · </span>}
          {group}
        </span>
      ))}
    </span>
  )
})

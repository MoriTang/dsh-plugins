import { z } from 'zod'
import type { Context } from '@deepseek-ai/cordis'
import type { TokenUsage } from '@deepseek-ai/dsh-llm'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'

/**
 * Wire view of one session's cost accounting: the token totals and the
 * estimated spend in the configured currency.
 */
export interface CostBalanceView {
  /** Cumulative billed input tokens (uncached + cache-read + cache-write). */
  inputTokens: number
  /** Cumulative output tokens. */
  outputTokens: number
  /** Cumulative cache-read tokens. */
  cacheReadTokens: number
  /** Cumulative cache-write tokens. */
  cacheWriteTokens: number
  /** Cumulative estimated spend, in the configured currency unit. */
  cost: number
  /** Currency symbol/unit the prices are expressed in. */
  currency: string
}

/** Fold state: the durable per-session buckets plus the running cost total. */
export interface CostBalanceState extends CostBalanceView {
  /** Last usage's turn/step so a repeated sample replaces instead of double-counts. */
  lastTurn: number
  lastStep: number
}

const zeroState = (currency: string): CostBalanceState => ({
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  cost: 0,
  currency,
  lastTurn: -1,
  lastStep: -1,
})

/** Extract provider usage from a session event, if any (mirrors token-meter). */
function usageOf(event: SessionEvent): { turn: number; step: number; usage: TokenUsage } | undefined {
  if (event.type === 'assistant/chunk' && event.data.chunk.type === 'usage') {
    return { turn: event.data.turn, step: event.data.step, usage: event.data.chunk.usage }
  }
  if (event.type === 'assistant/message' && event.data.usage !== undefined) {
    return { turn: event.data.turn, step: event.data.step, usage: event.data.usage }
  }
  return undefined
}

/** Per-million-token prices, in the same currency as `currency`. */
export interface Pricing {
  inputPerM: number
  outputPerM: number
  cacheReadPerM: number
  cacheWritePerM: number
}

/**
 * Build the session projection definition for one pricing snapshot. Prices
 * are captured at registration; a config hot-reload unloads and re-registers
 * the plugin, so the fold restarts from the durable log with new prices.
 */
export function costBalanceDefinition(pricing: Pricing, currency: string) {
  const costOf = (usage: TokenUsage): number => (
    usage.inputTokens / 1e6 * pricing.inputPerM
    + (usage.cacheReadTokens ?? 0) / 1e6 * pricing.cacheReadPerM
    + (usage.cacheWriteTokens ?? 0) / 1e6 * pricing.cacheWritePerM
    + usage.outputTokens / 1e6 * pricing.outputPerM
  )

  const viewSchema = z.object({
    inputTokens: z.number().nonnegative(),
    outputTokens: z.number().nonnegative(),
    cacheReadTokens: z.number().nonnegative(),
    cacheWriteTokens: z.number().nonnegative(),
    cost: z.number().nonnegative(),
    currency: z.string(),
  }).strict()

  const stateSchema = viewSchema.extend({
    lastTurn: z.number().int(),
    lastStep: z.number().int(),
  }).strict()

  const definition = {
    key: 'costBalance',
    stateVersion: 1,
    stateSchema,
    init: () => zeroState(currency),
    apply: (state: CostBalanceState, event: SessionEvent): CostBalanceState => {
      const sample = usageOf(event)
      if (sample === undefined) return state
      // A repeated sample for the same step replaces that step's earlier
      // value instead of double-counting (the same invariant token-meter relies on).
      if (sample.turn === state.lastTurn && sample.step === state.lastStep) {
        return { ...state, lastTurn: sample.turn, lastStep: sample.step }
      }
      const usage = sample.usage
      return {
        inputTokens: state.inputTokens + usage.inputTokens,
        outputTokens: state.outputTokens + usage.outputTokens,
        cacheReadTokens: state.cacheReadTokens + (usage.cacheReadTokens ?? 0),
        cacheWriteTokens: state.cacheWriteTokens + (usage.cacheWriteTokens ?? 0),
        cost: state.cost + costOf(usage),
        currency,
        lastTurn: sample.turn,
        lastStep: sample.step,
      }
    },
    wire: {
      viewSchema,
      view: (state: CostBalanceState): CostBalanceView => ({
        inputTokens: state.inputTokens,
        outputTokens: state.outputTokens,
        cacheReadTokens: state.cacheReadTokens,
        cacheWriteTokens: state.cacheWriteTokens,
        cost: state.cost,
        currency: state.currency,
      }),
    },
  } satisfies ProjectionDefinition<'costBalance', CostBalanceState>

  return definition
}

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionStateMap {
    costBalance: CostBalanceState
  }
  interface SessionProjectionMap {
    costBalance: CostBalanceView
  }
}

export type { Context }

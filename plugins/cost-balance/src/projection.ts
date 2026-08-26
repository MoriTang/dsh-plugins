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
  /** Cumulative uncached (cache-miss) input tokens. */
  inputTokens: number
  /** Cumulative output tokens. */
  outputTokens: number
  /** Cumulative cache-read tokens. */
  cacheReadTokens: number
  /** Cumulative cache-write tokens. */
  cacheWriteTokens: number
  /** Cumulative estimated spend, derived from the token buckets and pricing. */
  cost: number
  /** Currency symbol/unit the prices are expressed in. */
  currency: string
}

/** Disjoint token buckets from one usage sample. */
interface Buckets {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
}

const zeroBuckets = (): Buckets => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 })

/** Fold state: the durable per-session buckets plus the last step's sample. */
export interface CostBalanceState extends CostBalanceView {
  /**
   * The most recent usage sample's (turn, step) and its exact buckets. A
   * repeated sample for the SAME step (a stream usage chunk followed by the
   * final assistant/message usage) REPLACES that step's earlier contribution
   * instead of double-counting — the same invariant token-meter relies on.
   */
  last: { turn: number; step: number; buckets: Buckets } | null
}

const zeroState = (currency: string): CostBalanceState => ({
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  cost: 0,
  currency,
  last: null,
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

const bucketsEqual = (a: Buckets, b: Buckets): boolean =>
  a.input === b.input && a.output === b.output && a.cacheRead === b.cacheRead && a.cacheWrite === b.cacheWrite

/** Cost of one bucket set under the configured pricing. */
function bucketCost(b: Buckets, pricing: Pricing): number {
  return b.input / 1e6 * pricing.inputPerM
    + b.cacheRead / 1e6 * pricing.cacheReadPerM
    + b.cacheWrite / 1e6 * pricing.cacheWritePerM
    + b.output / 1e6 * pricing.outputPerM
}

/**
 * Build the session projection definition for one pricing snapshot. Prices
 * are captured at registration; a config hot-reload unloads and re-registers
 * the plugin, so the fold restarts from the durable log with new prices.
 */
export function costBalanceDefinition(pricing: Pricing, currency: string) {
  const viewSchema = z.object({
    inputTokens: z.number().nonnegative(),
    outputTokens: z.number().nonnegative(),
    cacheReadTokens: z.number().nonnegative(),
    cacheWriteTokens: z.number().nonnegative(),
    cost: z.number().nonnegative(),
    currency: z.string(),
  }).strict()

  const stateSchema = viewSchema.extend({
    last: z.object({
      turn: z.number().int().nonnegative(),
      step: z.number().int().nonnegative(),
      buckets: z.object({
        input: z.number().nonnegative(),
        output: z.number().nonnegative(),
        cacheRead: z.number().nonnegative(),
        cacheWrite: z.number().nonnegative(),
      }).strict(),
    }).nullable(),
  }).strict()

  const definition = {
    key: 'costBalance',
    stateVersion: 2,
    stateSchema,
    init: () => zeroState(currency),
    apply: (state: CostBalanceState, event: SessionEvent): CostBalanceState => {
      const sample = usageOf(event)
      if (sample === undefined) return state

      const buckets: Buckets = {
        input: sample.usage.inputTokens ?? 0,
        output: sample.usage.outputTokens ?? 0,
        cacheRead: sample.usage.cacheReadTokens ?? 0,
        cacheWrite: sample.usage.cacheWriteTokens ?? 0,
      }
      const sameStep = state.last !== null
        && state.last.turn === sample.turn
        && state.last.step === sample.step
      // Identical repeated sample (e.g. replay of the same event): no change.
      if (sameStep && bucketsEqual(state.last!.buckets, buckets)) return state

      // The final assistant/message usage REPLACES the stream chunk's earlier
      // sample for the same step: subtract the previous buckets, add the new.
      const previous = sameStep ? state.last!.buckets : zeroBuckets()
      const inputTokens = state.inputTokens - previous.input + buckets.input
      const outputTokens = state.outputTokens - previous.output + buckets.output
      const cacheReadTokens = state.cacheReadTokens - previous.cacheRead + buckets.cacheRead
      const cacheWriteTokens = state.cacheWriteTokens - previous.cacheWrite + buckets.cacheWrite
      // Cost is derived from the fresh buckets, never accumulated, so a
      // replacement cannot drift from floating-point add/subtract.
      const cost = bucketCost(
        { input: inputTokens, output: outputTokens, cacheRead: cacheReadTokens, cacheWrite: cacheWriteTokens },
        pricing,
      )

      return {
        inputTokens,
        outputTokens,
        cacheReadTokens,
        cacheWriteTokens,
        cost,
        currency,
        last: { turn: sample.turn, step: sample.step, buckets },
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

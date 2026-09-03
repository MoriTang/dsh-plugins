/**
 * Unit tests for the cost-balance projection fold.
 * Run from the harness checkout so `tsx` is resolvable:
 *
 *   node --import tsx/esm --test \
 *     <repo>/plugins/cost-balance/tests/projection.test.ts
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { costBalanceDefinition } from '../src/projection.ts'

type Usage = {
  inputTokens?: number
  outputTokens?: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
}

const pricing = {
  inputPerM: 2,
  outputPerM: 8,
  cacheReadPerM: 0.5,
  cacheWritePerM: 2,
}

function usageChunk(turn: number, step: number, usage: Usage): SessionEvent {
  return {
    type: 'assistant/chunk',
    data: { turn, step, chunk: { type: 'usage', usage } },
  } as SessionEvent
}

function assistantMessage(turn: number, step: number, usage?: Usage): SessionEvent {
  return {
    type: 'assistant/message',
    data: {
      turn,
      step,
      message: { role: 'assistant', content: [] },
      ...(usage === undefined ? {} : { usage }),
    },
  } as SessionEvent
}

test('init returns the all-zero state with currency passthrough', () => {
  const definition = costBalanceDefinition(pricing, 'CNY')
  const state = definition.init()

  assert.deepEqual(state, {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    cost: 0,
    currency: 'CNY',
    last: null,
  })
  assert.deepEqual(definition.stateSchema.parse(state), state)
})

test('apply ignores non-usage events and assistant messages without usage', () => {
  const definition = costBalanceDefinition(pricing, 'USD')
  const state = definition.apply(definition.init(), usageChunk(1, 1, { inputTokens: 10 }))
  const textChunk = {
    type: 'assistant/chunk',
    data: { turn: 1, step: 1, chunk: { type: 'text-delta', index: 0, text: 'hi' } },
  } as SessionEvent
  const turnStart = { type: 'turn/start', data: { turn: 2 } } as SessionEvent

  assert.strictEqual(definition.apply(state, textChunk), state)
  assert.strictEqual(definition.apply(state, turnStart), state)
  assert.strictEqual(definition.apply(state, assistantMessage(1, 1)), state)
})

test('usage from distinct turn-step pairs accumulates every token bucket', () => {
  const definition = costBalanceDefinition(pricing, 'USD')
  let state = definition.init()
  state = definition.apply(state, usageChunk(1, 1, {
    inputTokens: 100,
    outputTokens: 20,
    cacheReadTokens: 30,
    cacheWriteTokens: 40,
  }))
  state = definition.apply(state, assistantMessage(1, 2, {
    inputTokens: 7,
    outputTokens: 8,
    cacheReadTokens: 9,
    cacheWriteTokens: 10,
  }))
  state = definition.apply(state, usageChunk(2, 1, { outputTokens: 3 }))

  assert.deepEqual(
    {
      inputTokens: state.inputTokens,
      outputTokens: state.outputTokens,
      cacheReadTokens: state.cacheReadTokens,
      cacheWriteTokens: state.cacheWriteTokens,
    },
    { inputTokens: 107, outputTokens: 31, cacheReadTokens: 39, cacheWriteTokens: 50 },
  )
})

test('a later same-step sample replaces an earlier contribution even when smaller', () => {
  const definition = costBalanceDefinition(pricing, 'USD')
  let state = definition.init()
  state = definition.apply(state, usageChunk(3, 4, {
    inputTokens: 1_000,
    outputTokens: 500,
    cacheReadTokens: 300,
    cacheWriteTokens: 200,
  }))
  state = definition.apply(state, assistantMessage(3, 4, {
    inputTokens: 100,
    outputTokens: 50,
    cacheReadTokens: 30,
    cacheWriteTokens: 20,
  }))

  assert.deepEqual(
    {
      inputTokens: state.inputTokens,
      outputTokens: state.outputTokens,
      cacheReadTokens: state.cacheReadTokens,
      cacheWriteTokens: state.cacheWriteTokens,
    },
    { inputTokens: 100, outputTokens: 50, cacheReadTokens: 30, cacheWriteTokens: 20 },
  )
  assert.deepEqual(state.last, {
    turn: 3,
    step: 4,
    buckets: { input: 100, output: 50, cacheRead: 30, cacheWrite: 20 },
  })
})

test('an identical repeated sample for the same step returns the state unchanged', () => {
  const definition = costBalanceDefinition(pricing, 'USD')
  const usage = {
    inputTokens: 11,
    outputTokens: 12,
    cacheReadTokens: 13,
    cacheWriteTokens: 14,
  }
  const state = definition.apply(definition.init(), usageChunk(1, 2, usage))

  assert.strictEqual(definition.apply(state, assistantMessage(1, 2, usage)), state)
})

test('cost is derived from current totals and same-step replacement does not drift', () => {
  const definition = costBalanceDefinition(pricing, 'credits')
  const example = definition.apply(definition.init(), usageChunk(1, 1, {
    inputTokens: 2_500_000,
    outputTokens: 500_000,
  }))
  assert.equal(example.cost, 9)

  const withAllBuckets = definition.apply(example, usageChunk(2, 1, {
    inputTokens: 2_500_000,
    outputTokens: 500_000,
    cacheReadTokens: 2_000_000,
    cacheWriteTokens: 250_000,
  }))
  assert.equal(withAllBuckets.cost, 19.5)

  const replaced = definition.apply(withAllBuckets, assistantMessage(2, 1, {
    inputTokens: 1_000_000,
    outputTokens: 250_000,
    cacheReadTokens: 500_000,
    cacheWriteTokens: 125_000,
  }))
  assert.equal(replaced.cost, 13.5)
  assert.equal(replaced.cost, (
    replaced.inputTokens / 1e6 * pricing.inputPerM
    + replaced.outputTokens / 1e6 * pricing.outputPerM
    + replaced.cacheReadTokens / 1e6 * pricing.cacheReadPerM
    + replaced.cacheWriteTokens / 1e6 * pricing.cacheWritePerM
  ))
})

test('version and schemas describe produced state and the six-field wire view', () => {
  const definition = costBalanceDefinition(pricing, 'USD')
  const state = definition.apply(definition.init(), usageChunk(1, 1, {
    inputTokens: 4,
    outputTokens: 3,
    cacheReadTokens: 2,
    cacheWriteTokens: 1,
  }))

  assert.equal(definition.stateVersion, 2)
  assert.deepEqual(definition.stateSchema.parse(state), state)

  const view = definition.wire.view(state)
  assert.deepEqual(Object.keys(view).sort(), [
    'cacheReadTokens',
    'cacheWriteTokens',
    'cost',
    'currency',
    'inputTokens',
    'outputTokens',
  ])
  assert.equal('last' in view, false)
  assert.deepEqual(definition.wire.viewSchema.parse(view), view)
})

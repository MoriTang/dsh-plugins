/**
 * Unit tests for the framework-free audit core (classify/ledger/format).
 * Run from the harness checkout so `tsx` is resolvable:
 *
 *   node --import tsx/esm --test \
 *     <repo>/plugins/tool-audit/tests/audit-core.test.ts
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  argsPreview,
  classifyOutcome,
  formatDuration,
  TOOL_AUDIT_TIMEOUT,
  ToolAuditLedger,
} from '../src/audit-core.ts'

const base = {
  sessionId: 's1',
  callId: 'call-1',
  name: 'bash',
  argsPreview: '{}',
  startedAt: 1_000,
  durationMs: 100,
  outcome: 'ok' as const,
  errorCode: null,
  slow: false,
}

test('classifyOutcome: timeout wins over abort/error via our flag or known codes', () => {
  // Our own deadline flag.
  assert.equal(classifyOutcome({ isError: false, errorCode: null, timedOut: true }), 'timeout')
  // Shipped policy code and this plugin's own code both read as timeout.
  assert.equal(classifyOutcome({ isError: true, errorCode: 'TOOL_TIMEOUT', timedOut: false }), 'timeout')
  assert.equal(classifyOutcome({ isError: true, errorCode: TOOL_AUDIT_TIMEOUT, timedOut: false }), 'timeout')
})

test('classifyOutcome: harness cancellation codes read as aborted and keep their code', () => {
  for (const code of ['ABORTED', 'ABORTED_BEFORE_DISPATCH']) {
    assert.equal(classifyOutcome({ isError: true, errorCode: code, timedOut: false }), 'aborted')
  }
  // A plain error code stays error; success stays ok.
  assert.equal(classifyOutcome({ isError: true, errorCode: 'FS_NOT_FOUND', timedOut: false }), 'error')
  assert.equal(classifyOutcome({ isError: false, errorCode: null, timedOut: false }), 'ok')
})

test('ledger assigns monotonically increasing seq and returns newest first', () => {
  const ledger = new ToolAuditLedger({ maxPerSession: 10, maxTotal: 100 })
  const a = ledger.push({ ...base, name: 'bash', callId: 'c1' })
  const b = ledger.push({ ...base, name: 'fs', callId: 'c2' })
  assert.ok(a.seq < b.seq)
  const all = ledger.recent(undefined, 0)
  assert.deepEqual(all.map(r => r.callId), ['c2', 'c1'])
  assert.equal(all[0].seq, b.seq)
})

test('ledger recent filters by session and caps by limit', () => {
  const ledger = new ToolAuditLedger({ maxPerSession: 10, maxTotal: 100 })
  ledger.push({ ...base, sessionId: 's1', callId: 'a' })
  ledger.push({ ...base, sessionId: 's2', callId: 'b' })
  ledger.push({ ...base, sessionId: 's1', callId: 'c' })
  assert.deepEqual(ledger.recent('s1', 0).map(r => r.callId), ['c', 'a'])
  assert.deepEqual(ledger.recent('s1', 1).map(r => r.callId), ['c'])
  assert.deepEqual(ledger.recent(undefined, 2).map(r => r.callId), ['c', 'b'])
})

test('ledger trims per session without evicting other sessions wholesale', () => {
  const ledger = new ToolAuditLedger({ maxPerSession: 2, maxTotal: 100 })
  for (let i = 0; i < 5; i += 1) ledger.push({ ...base, sessionId: 's1', callId: `a${i}` })
  for (let i = 0; i < 3; i += 1) ledger.push({ ...base, sessionId: 's2', callId: `b${i}` })
  const s1 = ledger.recent('s1', 0).map(r => r.callId)
  const s2 = ledger.recent('s2', 0).map(r => r.callId)
  assert.deepEqual(s1, ['a4', 'a3'])
  assert.deepEqual(s2, ['b2', 'b1'])
})

test('ledger trims total overflow oldest-first', () => {
  const ledger = new ToolAuditLedger({ maxPerSession: 100, maxTotal: 3 })
  ledger.push({ ...base, callId: 'a' })
  ledger.push({ ...base, callId: 'b' })
  ledger.push({ ...base, callId: 'c' })
  ledger.push({ ...base, callId: 'd' })
  assert.deepEqual(ledger.recent(undefined, 0).map(r => r.callId), ['d', 'c', 'b'])
  assert.equal(ledger.size, 3)
})

test('ledger clear drops entries and keeps seq monotonic', () => {
  const ledger = new ToolAuditLedger({ maxPerSession: 10, maxTotal: 100 })
  const a = ledger.push({ ...base, callId: 'a' })
  ledger.clear()
  assert.equal(ledger.size, 0)
  const b = ledger.push({ ...base, callId: 'b' })
  assert.ok(b.seq > a.seq)
})

test('argsPreview truncates long JSON in the middle and survives non-JSON', () => {
  const long = JSON.stringify({ blob: 'x'.repeat(500) })
  const preview = argsPreview(long, 40)
  assert.ok(preview.length <= 40)
  assert.ok(preview.includes('…'))
  const circular: Record<string, unknown> = {}
  circular.self = circular
  assert.equal(argsPreview(circular, 40), '[object Object]')
  assert.equal(argsPreview(null), 'null')
})

test('formatDuration renders ms, seconds, and minutes without boundary artifacts', () => {
  assert.equal(formatDuration(412), '412ms')
  assert.equal(formatDuration(1_234), '1.2s')
  assert.equal(formatDuration(62_300), '1m2s')
  // Rounding that would otherwise produce 60.0s / 3m60s.
  assert.equal(formatDuration(59_999), '1m0s')
  assert.equal(formatDuration(59_951), '1m0s')
  assert.equal(formatDuration(59_949), '59.9s')
  assert.equal(formatDuration(239_951), '4m0s')
  assert.equal(formatDuration(Number.NaN), '0ms')
  assert.equal(formatDuration(-5), '0ms')
})

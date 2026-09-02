/**
 * Integration-style tests for the host wrapper (src/index.ts apply) with a
 * minimal fake ctx: exercises signal swap/restore, settle recording, the
 * TOOL_AUDIT_TIMEOUT replacement, and the /tool-audit/recent route.
 *
 * Run from the harness checkout (tsx resolvable there):
 *
 *   node --import tsx/esm --test \
 *     /Users/mori/src/dsh/plugins/tool-audit/tests/host-integration.test.ts
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { apply, TOOL_AUDIT_TIMEOUT } from '../src/index.ts'

interface FakeRoute {
  kind: string
  path: string
  handler: (req: unknown, res: { setHeader: (k: string, v: string) => void; end: (s: string) => void }) => void
}

/** Minimal cordis-like ctx: capture the tools/execute listener + route. */
function fakeCtx(): {
  ctx: any
  execute: (exec: any, next: () => Promise<any>) => Promise<any>
  query: (url: string) => any
} {
  let executeHandler: ((exec: any, next: () => Promise<any>) => Promise<any>) | undefined
  const routes: FakeRoute[] = []
  const ctx = {
    on: (event: string, handler: (exec: any, next: () => Promise<any>) => Promise<any>) => {
      if (event === 'tools/execute') executeHandler = handler
    },
    effect: (fn: () => void) => { fn() },
    webServer: {
      register: (def: FakeRoute) => { routes.push(def) },
    },
  }
  const query = (url: string): any => {
    const route = routes.find(r => r.kind === 'exact' && r.path === '/tool-audit/recent')
    assert.ok(route, 'route /tool-audit/recent registered')
    let body = ''
    const res = {
      setHeader: () => {},
      end: (chunk: string) => { body += chunk },
    }
    route.handler({ url } as never, res)
    return JSON.parse(body)
  }
  return {
    ctx,
    execute: (exec: any, next: () => Promise<any>) => executeHandler!(exec, next),
    query,
  }
}

const okResult = () => ({ isError: false, content: [{ type: 'text', text: 'ok' }] })

test('wrapper records an ok call and the route returns it newest-first', async () => {
  const { ctx, execute, query } = fakeCtx()
  apply(ctx, { slowThresholdMs: 1_000, maxPerSession: 10, maxTotal: 100 })
  const exec = {
    callId: 'call-1', name: 'bash', arguments: { command: 'echo hi' },
    agent: { id: 'sess-1' }, signal: new AbortController().signal,
  }
  const result = await execute(exec, okResult)
  assert.equal(result.isError, false)
  assert.equal(exec.signal.aborted, false, 'caller signal restored un-aborted')

  const payload = query('/tool-audit/recent?session=sess-1&limit=10')
  assert.equal(payload.entries.length, 1)
  const entry = payload.entries[0]
  assert.equal(entry.name, 'bash')
  assert.equal(entry.outcome, 'ok')
  assert.equal(entry.slow, false)
  assert.equal(entry.sessionId, 'sess-1')
  assert.equal(payload.meta.slowThresholdMs, 1_000)
})

test('wrapper records a failed call with its structured code', async () => {
  const { ctx, execute, query } = fakeCtx()
  apply(ctx, { slowThresholdMs: 1_000, maxPerSession: 10, maxTotal: 100 })
  const exec = {
    callId: 'call-2', name: 'fs', arguments: {},
    agent: { id: 'sess-1' }, signal: new AbortController().signal,
  }
  await execute(exec, async () => ({
    isError: true,
    content: [{ type: 'text', text: 'Error: nope' }],
    error: { message: 'nope', info: { name: 'ToolError', code: 'EXPLODED' } },
  }))
  const payload = query('/tool-audit/recent')
  assert.equal(payload.entries[0].outcome, 'error')
  assert.equal(payload.entries[0].errorCode, 'EXPLODED')
})

test('abortAfterMs: deadline fires, result replaced, signal restored', async () => {
  const { ctx, execute, query } = fakeCtx()
  apply(ctx, { slowThresholdMs: 1_000, abortAfterMs: 10, maxPerSession: 10, maxTotal: 100 })
  const upstream = new AbortController()
  const exec = {
    callId: 'call-3', name: 'slow', arguments: {},
    agent: { id: 'sess-1' }, signal: upstream.signal,
  }
  // The tool honors the (swapped) signal and settles only on abort.
  const result = await execute(exec, () => new Promise((resolve) => {
    exec.signal.addEventListener('abort', () => resolve({
      isError: true,
      content: [{ type: 'text', text: 'aborted' }],
      error: { message: 'aborted', info: { name: 'AbortError', code: 'ABORTED' } },
    }))
  }))
  assert.equal(result.isError, true)
  const info = result.error.info as { name: string; code: string }
  assert.equal(info.code, TOOL_AUDIT_TIMEOUT, 'result replaced with TOOL_AUDIT_TIMEOUT')
  assert.equal(upstream.signal.aborted, false, 'caller signal must stay un-aborted')
  assert.equal(exec.signal, upstream.signal, 'exec.signal restored to the caller signal')

  const payload = query('/tool-audit/recent?session=sess-1')
  assert.equal(payload.entries[0].outcome, 'timeout')
  assert.equal(payload.entries[0].errorCode, TOOL_AUDIT_TIMEOUT)
})

test('abortAfterMs: caller cancellation before the deadline is not a timeout', async () => {
  const { ctx, execute, query } = fakeCtx()
  apply(ctx, { slowThresholdMs: 1_000, abortAfterMs: 5_000, maxPerSession: 10, maxTotal: 100 })
  const upstream = new AbortController()
  const exec = {
    callId: 'call-4', name: 'canceled', arguments: {},
    agent: { id: 'sess-1' }, signal: upstream.signal,
  }
  const run = execute(exec, () => new Promise((resolve) => {
    exec.signal.addEventListener('abort', () => resolve({
      isError: true,
      content: [{ type: 'text', text: 'canceled' }],
      error: { message: 'canceled', info: { name: 'AbortError', code: 'ABORTED' } },
    }))
  }))
  upstream.abort(new Error('user stop'))
  const result = await run
  assert.equal(result.error.info.code, 'ABORTED', 'caller cancel keeps the tool result')
  const payload = query('/tool-audit/recent?session=sess-1')
  assert.equal(payload.entries[0].outcome, 'aborted')
})

test('route filters by session and caps by limit', async () => {
  const { ctx, execute, query } = fakeCtx()
  apply(ctx, { slowThresholdMs: 1_000, maxPerSession: 10, maxTotal: 100 })
  const execA = { callId: 'a', name: 'bash', arguments: {}, agent: { id: 's1' }, signal: new AbortController().signal }
  const execB = { callId: 'b', name: 'fs', arguments: {}, agent: { id: 's2' }, signal: new AbortController().signal }
  await execute(execA, okResult)
  await execute(execB, okResult)
  assert.equal(query('/tool-audit/recent?session=s1').entries.length, 1)
  assert.equal(query('/tool-audit/recent').entries.length, 2)
  assert.equal(query('/tool-audit/recent?limit=1').entries.length, 1)
})

/**
 * Integration-style tests for the host half (src/index.ts apply) with a
 * minimal fake ctx: exercises the tools/execute timing pass, the tools/result
 * authoritative commit, the TOOL_AUDIT_TIMEOUT replacement, deadline-vs-
 * declared-budget skips, and the /tool-audit/recent route's validation.
 *
 * Run from the plugin directory: `npm test`.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { apply, TOOL_AUDIT_TIMEOUT } from '../src/index.ts'

interface FakeRoute {
  kind: string
  path: string
  handler: (req: unknown, res: {
    statusCode?: number
    setHeader: (k: string, v: string) => void
    end: (s: string) => void
  }) => void
}

interface FakeExec {
  token: symbol
  callId: string
  name: string
  arguments: unknown
  agent?: { id: string }
  signal: AbortSignal
}

const okResult = () => ({ isError: false, content: [{ type: 'text', text: 'ok' }] })

function errorResult(code: string, message = `err ${code}`) {
  return {
    isError: true,
    content: [{ type: 'text', text: `Error: ${message}` }],
    error: { message, info: { name: `${code}Error`, code } },
  }
}

/** Minimal cordis-like ctx whose tools listeners + route the tests drive. */
function fakeCtx(): {
  ctx: Record<string, unknown>
  settle: (exec: FakeExec, next: () => unknown, opts?: { authoritative?: unknown }) => Promise<unknown>
  declaredTimeoutMs: () => number | undefined
  query: (url: string) => { status: number; body: any }
} {
  let executeHandler: ((exec: any, next: () => Promise<any>) => Promise<any>) | undefined
  let resultHandler: ((exec: any, result: any) => void) | undefined
  let toolTimeoutMs: number | undefined
  const routes: FakeRoute[] = []
  const ctx = {
    tools: {
      get: () => (toolTimeoutMs === undefined ? undefined : { timeoutMs: toolTimeoutMs }),
    },
    on: (event: string, handler: (...args: any[]) => any) => {
      if (event === 'tools/execute') executeHandler = handler
      if (event === 'tools/result') resultHandler = handler
    },
    effect: (fn: () => void) => { fn() },
    webServer: {
      register: (def: FakeRoute) => { routes.push(def) },
    },
  }
  const query = (url: string): { status: number; body: any } => {
    const route = routes.find(r => r.kind === 'exact' && r.path === '/tool-audit/recent')
    assert.ok(route, 'route /tool-audit/recent registered (call apply first)')
    let body = ''
    const res = {
      statusCode: 200,
      setHeader: () => {},
      end: (chunk: string) => { body += chunk },
    }
    route.handler({ url } as never, res)
    return { status: res.statusCode ?? 200, body: JSON.parse(body) }
  }
  return {
    ctx,
    settle: async (exec, next, opts) => {
      const returned = await executeHandler!(exec, async () => await next())
      // The harness normalizes AFTER wrappers settle (caller cancellation,
      // post-execute replacement) and only then emits the frozen authoritative
      // result through tools/result. The test may supply that authoritative
      // result explicitly to simulate such a change.
      const authoritative = opts?.authoritative ?? returned
      resultHandler!(exec, authoritative)
      return returned
    },
    declaredTimeoutMs: () => toolTimeoutMs,
    query,
  }
}

function makeExec(id: string, name = 'bash'): FakeExec {
  return {
    token: Symbol(id),
    callId: `call-${id}`,
    name,
    arguments: {},
    agent: { id: 'sess-1' },
    signal: new AbortController().signal,
  }
}

function install(config: Parameters<typeof apply>[1]) {
  const fake = fakeCtx()
  apply(fake.ctx as never, config)
  return fake
}

test('ok call: timed, committed from tools/result, route returns it', async () => {
  const fake = install({ slowThresholdMs: 1_000, maxPerSession: 10, maxTotal: 100 })
  await fake.settle(makeExec('a'), okResult)
  const payload = fake.query('/tool-audit/recent?session=sess-1&limit=10')
  assert.equal(payload.status, 200)
  assert.equal(payload.body.entries.length, 1)
  const entry = payload.body.entries[0]
  assert.equal(entry.name, 'bash')
  assert.equal(entry.outcome, 'ok')
  assert.equal(entry.errorCode, null)
  assert.equal(entry.slow, false)
  assert.equal(entry.sessionId, 'sess-1')
  assert.equal(payload.body.meta.slowThresholdMs, 1_000)
})

test('error call keeps its structured code', async () => {
  const fake = install({ slowThresholdMs: 1_000, maxPerSession: 10, maxTotal: 100 })
  await fake.settle(makeExec('b', 'fs'), async () => errorResult('FS_NOT_FOUND'))
  const entry = fake.query('/tool-audit/recent?session=sess-1').body.entries[0]
  assert.equal(entry.outcome, 'error')
  assert.equal(entry.errorCode, 'FS_NOT_FOUND')
})

test('shipped TOOL_TIMEOUT (authoritative, post-wrapper) is recorded as timeout', async () => {
  const fake = install({ slowThresholdMs: 1_000, maxPerSession: 10, maxTotal: 100 })
  // The wrapper saw an intermediate ok; an OUTER wrapper (or post-policy
  // normalization) replaced the outcome with TOOL_TIMEOUT before tools/result.
  await fake.settle(makeExec('c'), okResult, { authoritative: errorResult('TOOL_TIMEOUT') })
  const entry = fake.query('/tool-audit/recent?session=sess-1').body.entries[0]
  assert.equal(entry.outcome, 'timeout')
  assert.equal(entry.errorCode, 'TOOL_TIMEOUT')
})

test('harness cancellation code ABORTED is recorded as aborted with its code', async () => {
  const fake = install({ slowThresholdMs: 1_000, maxPerSession: 10, maxTotal: 100 })
  await fake.settle(makeExec('d'), async () => errorResult('ABORTED'))
  const entry = fake.query('/tool-audit/recent?session=sess-1').body.entries[0]
  assert.equal(entry.outcome, 'aborted')
  assert.equal(entry.errorCode, 'ABORTED')
})

test('abortAfterMs: our deadline fires, result replaced, signal restored', async () => {
  const fake = install({ slowThresholdMs: 1_000, abortAfterMs: 10, maxPerSession: 10, maxTotal: 100 })
  const upstream = new AbortController()
  const exec = { ...makeExec('e', 'slow'), signal: upstream.signal }
  // The tool honors the (swapped) signal and settles only on abort.
  const result = (await fake.settle(exec, () => new Promise((resolve) => {
    exec.signal.addEventListener('abort', () => resolve(errorResult('ABORTED')))
  }))) as { isError: boolean; error: { info: { name: string; code: string } } }
  assert.equal(result.isError, true)
  const info = result.error.info as { name: string; code: string }
  assert.equal(info.code, TOOL_AUDIT_TIMEOUT, 'result replaced with TOOL_AUDIT_TIMEOUT')
  assert.equal(upstream.signal.aborted, false, 'caller signal must stay un-aborted')
  assert.equal(exec.signal, upstream.signal, 'exec.signal restored to the caller signal')
  const entry = fake.query('/tool-audit/recent?session=sess-1').body.entries[0]
  assert.equal(entry.outcome, 'timeout')
  assert.equal(entry.errorCode, TOOL_AUDIT_TIMEOUT)
})

test('abortAfterMs: skipped for tools that declare their own timeoutMs budget', async () => {
  const fake = fakeCtx()
  fake.ctx = {
    ...fake.ctx,
    tools: { get: () => ({ timeoutMs: 5_000 }) },
  }
  apply(fake.ctx as never, { slowThresholdMs: 1_000, abortAfterMs: 10, maxPerSession: 10, maxTotal: 100 })
  const upstream = new AbortController()
  const exec = { ...makeExec('f', 'declared'), signal: upstream.signal }
  // No audit deadline armed: an uncooperative body runs to completion past 10ms.
  const result = (await fake.settle(exec, async () => {
    await new Promise(resolve => setTimeout(resolve, 30))
    return okResult()
  })) as { isError: boolean }
  assert.equal(result.isError, false, 'declared-budget tool is NOT aborted by the audit deadline')
})

test('route: missing session and malformed limit are rejected, safe default applied', async () => {
  const fake = install({ slowThresholdMs: 1_000, maxPerSession: 10, maxTotal: 100 })
  await fake.settle(makeExec('g'), okResult)
  const noSession = fake.query('/tool-audit/recent')
  assert.equal(noSession.status, 400)
  const badLimit = fake.query('/tool-audit/recent?session=sess-1&limit=abc')
  assert.equal(badLimit.status, 400)
  const zeroLimit = fake.query('/tool-audit/recent?session=sess-1&limit=0')
  assert.equal(zeroLimit.status, 400)
  // No limit → safe default (still returns the record).
  const defaulted = fake.query('/tool-audit/recent?session=sess-1')
  assert.equal(defaulted.status, 200)
  assert.equal(defaulted.body.entries.length, 1)
})

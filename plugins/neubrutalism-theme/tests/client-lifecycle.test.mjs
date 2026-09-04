import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'
import vm from 'node:vm'

describe('built browser client', () => {
  it('registers its lazy module and disposes tokens and styles', async () => {
    let registration
    const appended = []
    const document = {
      createElement(tagName) {
        return {
          tagName,
          attributes: new Map(),
          textContent: '',
          setAttribute(name, value) { this.attributes.set(name, value) },
          remove() {
            const index = appended.indexOf(this)
            if (index >= 0) appended.splice(index, 1)
          },
        }
      },
      head: { append(element) { appended.push(element) } },
    }
    const window = {
      __ModuleLoader__: {
        load(value) { registration = value },
      },
    }
    const source = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
    vm.runInNewContext(source, { document, window })

    assert.equal(registration.id, 'dsh-neubrutalism-theme')
    const client = registration.factory(() => {
      throw new Error('the built client should have no runtime package imports')
    })
    const tokenDispose = () => { tokenDispose.called = true }
    tokenDispose.called = false
    const effects = []
    const ctx = {
      theme: {
        overrideTokens(sourceName, tokens) {
          assert.equal(sourceName, 'dsh-neubrutalism-theme')
          assert.equal(tokens['--dsw-alias-bg-base'].light, '#fffdf5')
          return tokenDispose
        },
      },
      effect(execute) { effects.push(execute()) },
    }

    client.apply(ctx)
    assert.equal(appended.length, 1)
    assert.match(appended[0].textContent, /font-family: 'Syne Variable'/)
    assert.match(appended[0].textContent, /data:font\/woff2;base64,/)
    assert.match(appended[0].textContent, /border-radius: 0 !important/)

    for (const dispose of effects.reverse()) dispose()
    assert.equal(appended.length, 0)
    assert.equal(tokenDispose.called, true)
  })
})

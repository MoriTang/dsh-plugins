import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'
import { TOKEN_OVERRIDES } from '../src/client/tokens.ts'

describe('Neubrutalism theme', () => {
  it('defines both color schemes for every override', () => {
    for (const [name, modes] of Object.entries(TOKEN_OVERRIDES)) {
      assert.ok(modes.light.length > 0, `${name} needs a light value`)
      assert.ok(modes.dark.length > 0, `${name} needs a dark value`)
    }
  })

  it('uses the guide palette and zero-blur hard shadows', () => {
    assert.deepEqual(TOKEN_OVERRIDES['--dsw-alias-bg-base'], {
      light: '#fffdf5',
      dark: '#151515',
    })
    assert.equal(TOKEN_OVERRIDES['--dsw-specific-sidebar-fill'].light, '#ffd23f')
    assert.equal(TOKEN_OVERRIDES['--dsw-alias-button-elevated-fill'].dark, '#554817')
    assert.match(TOKEN_OVERRIDES['--dsw-shadow-lv3'].light, /^8px 8px 0 0 /)
  })

  it('keeps focus and reduced-motion behavior in the stylesheet', async () => {
    const css = await readFile(new URL('../src/client/neubrutalism.css', import.meta.url), 'utf8')
    assert.match(css, /border: 2px solid/)
    assert.match(css, /dialog[^}]+border: 3px solid/s)
    assert.match(css, /border-radius: 0 !important/)
    assert.match(css, /button\[class\*='searchButton'\]/)
    assert.match(css, /\[class\*='collapsed'\] button/)
    assert.match(css, /\[class\*='rail'\] button/)
    assert.match(css, /button\[class\*='searchButton'\]:is\(:hover, :active\)[^{]*\{[^}]*transform: none !important/s)
    assert.match(css, /\[class\*='rail'\] button:focus-visible[^{]*\{[^}]*outline-offset: -3px !important/s)
    assert.match(css, /button\[role='tab'\][^{]*\{[^}]*border: 0 !important[^}]*box-shadow: none !important/s)
    assert.match(css, /button\[role='tab'\]:is\(:hover, :active\)[^{]*\{[^}]*transform: none !important/s)
    assert.match(css, /:focus-visible/)
    assert.match(css, /prefers-reduced-motion: reduce/)
    assert.doesNotMatch(css, /(?:linear|radial)-gradient/)
  })
})

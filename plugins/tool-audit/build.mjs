/**
 * Build the tool-audit plugin artifacts:
 *
 * - `lib/index.js`   — host half (Node), esbuild ESM bundle.
 * - `lib/client.js`  — browser half, emitted as the loader's lazy-CJS
 *   factory artifact (`window.__ModuleLoader__.load({ id, factory })`) with
 *   module-table externals resolved through the injected `require`.
 *
 * The harness ships its own tsdown clientBundle preset, but that preset is
 * not published, so an out-of-tree package reproduces the output format here
 * (see docs/cookbook/adding-a-settings-card.md).
 */
import { createRequire } from 'node:module'
import { mkdirSync, existsSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// esbuild is not a dependency of this package (the registry is not reachable
// for out-of-tree installs). Resolve it from the harness checkout's pnpm
// store, which exposes a `.pnpm/node_modules` virtual store. The checkout is
// the sibling `../deepseek-harness` of the plugins repository root, and can be
// overridden with the DSH_HARNESS environment variable.
const root = dirname(fileURLToPath(import.meta.url))
// root = <repo>/plugins/tool-audit  →  repo parent  →  sibling harness
const harness = resolve(process.env.DSH_HARNESS ?? resolve(root, '../../..', 'deepseek-harness'))
const esbuildEntry = join(harness, 'node_modules/.pnpm/node_modules/esbuild/lib/main.js')
if (!existsSync(esbuildEntry)) {
  throw new Error(`esbuild not found at ${esbuildEntry}; set DSH_HARNESS to your deepseek-harness checkout`)
}
const require = createRequire(esbuildEntry)
const { build } = require('esbuild')

const PKG_ID = 'dsh-tool-audit'

/** Specifiers the browser resolves from the client module table (never bundled). */
const CLIENT_EXTERNALS = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-conversation/client',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
]

mkdirSync(`${root}/lib`, { recursive: true })

// ── host half ──────────────────────────────────────────────────────────────
await build({
  entryPoints: [`${root}/src/index.ts`],
  outfile: `${root}/lib/index.js`,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  external: ['node:*', ...CLIENT_EXTERNALS.filter(s => s.startsWith('@deepseek-ai/'))],
})

// ── browser half ───────────────────────────────────────────────────────────
const client = await build({
  entryPoints: [`${root}/src/client/index.ts`],
  bundle: true,
  platform: 'browser',
  format: 'cjs',
  target: 'es2020',
  external: CLIENT_EXTERNALS,
  write: false,
})

const body = client.outputFiles[0].text
const artifact = `window.__ModuleLoader__.load({
\tid: ${JSON.stringify(PKG_ID)},
\tfactory: (require) => {
\t\tvar module = { exports: {} };
\t\tvar exports = module.exports;
${body}
\t\treturn module.exports;
\t}
});
`
await writeFile(`${root}/lib/client.js`, artifact)
console.log('built lib/index.js + lib/client.js')

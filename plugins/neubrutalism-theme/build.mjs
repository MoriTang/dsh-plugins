/** Build the Host and lazy-CJS Web halves with locally embedded fonts. */
import { createRequire } from 'node:module'
import { mkdirSync, readFileSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const localRequire = createRequire(import.meta.url)
const { build } = localRequire('esbuild')
const PACKAGE_ID = 'dsh-neubrutalism-theme'

function fontFace(packageName, filename, family, weight) {
  const packageRoot = dirname(localRequire.resolve(`${packageName}/package.json`))
  const data = readFileSync(join(packageRoot, 'files', filename)).toString('base64')
  return `@font-face {
  font-family: '${family}';
  font-style: normal;
  font-display: swap;
  font-weight: ${weight};
  src: url(data:font/woff2;base64,${data}) format('woff2');
}`
}

const fontCss = [
  fontFace('@fontsource-variable/syne', 'syne-latin-wght-normal.woff2', 'Syne Variable', '400 800'),
  fontFace('@fontsource-variable/space-grotesk', 'space-grotesk-latin-wght-normal.woff2', 'Space Grotesk Variable', '300 700'),
  fontFace('@fontsource-variable/inter', 'inter-latin-wght-normal.woff2', 'Inter Variable', '100 900'),
  fontFace('@fontsource/space-mono', 'space-mono-latin-400-normal.woff2', 'Space Mono', '400'),
  fontFace('@fontsource/space-mono', 'space-mono-latin-700-normal.woff2', 'Space Mono', '700'),
].join('\n\n')

mkdirSync(join(root, 'lib'), { recursive: true })

await build({
  entryPoints: [join(root, 'src/index.ts')],
  outfile: join(root, 'lib/index.js'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  external: ['@deepseek-ai/cordis'],
})

const client = await build({
  entryPoints: [join(root, 'src/client/index.ts')],
  bundle: true,
  platform: 'browser',
  format: 'cjs',
  target: 'es2020',
  external: [
    '@deepseek-ai/cordis',
    '@deepseek-ai/dsh-client-ui-theme/client',
  ],
  loader: { '.css': 'text' },
  define: {
    __DSH_NEUBRUTALISM_FONT_CSS__: JSON.stringify(fontCss),
  },
  write: false,
})

const body = client.outputFiles[0].text
const artifact = `window.__ModuleLoader__.load({
\tid: ${JSON.stringify(PACKAGE_ID)},
\tfactory: (require) => {
\t\tvar module = { exports: {} };
\t\tvar exports = module.exports;
${body}
\t\treturn module.exports;
\t}
});
`
await writeFile(join(root, 'lib/client.js'), artifact)
console.log(`built ${PACKAGE_ID}: lib/index.js + lib/client.js (${fontCss.length} font CSS bytes embedded)`)

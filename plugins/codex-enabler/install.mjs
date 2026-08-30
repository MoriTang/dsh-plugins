/**
 * Install the official Codex Host provider, this companion bundle, and one
 * user agent preset that grants the model-facing Codex tool.
 *
 * Usage: node install.mjs [profile] [harness-checkout] [preset-id]
 */

import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  createCodexPreset,
  resolveDshHome,
  validatePresetId,
} from './install-lib.mjs'

const profile = process.argv[2] ?? 'web'
const here = dirname(fileURLToPath(import.meta.url))
const harness = resolve(process.argv[3] ?? resolve(here, '../../../deepseek-harness'))
const presetId = process.argv[4] ?? 'standard-codex'

if (profile === '' || profile.includes('/') || profile.includes('\\')
  || profile === '.' || profile === '..' || profile === 'node_modules') {
  throw new Error(`invalid profile name ${JSON.stringify(profile)}`)
}
validatePresetId(presetId)
if (!existsSync(join(harness, 'pnpm-workspace.yaml'))) {
  throw new Error(`DeepSeek Harness checkout not found: ${harness}`)
}

function runPnpm(args) {
  console.log(`$ pnpm ${args.map(argument => JSON.stringify(argument)).join(' ')}`)
  const result = spawnSync('pnpm', args, {
    cwd: harness,
    stdio: 'inherit',
    shell: false,
  })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) {
    throw new Error(`pnpm exited with status ${result.status ?? 'unknown'}`)
  }
}

const providerBundle = join(harness, 'packages/subagent/subagent-codex')
const sourcePreset = join(harness, 'packages/preset/agent-presets/presets/standard')
const targetPreset = join(resolveDshHome(), '.agent-presets', presetId)

console.log(`Installing Codex integration for profile ${JSON.stringify(profile)}`)
runPnpm(['dsh', 'plugin', '--profile', profile, 'add', providerBundle])
runPnpm(['dsh', 'plugin', '--profile', profile, 'add', here])

const preset = createCodexPreset({
  sourceDir: sourcePreset,
  targetDir: targetPreset,
  displayName: 'Standard + Codex',
})

console.log(preset.created
  ? `Created agent preset: ${preset.targetDir}`
  : `Agent preset already enabled; left unchanged: ${preset.targetDir}`)
console.log('Restart the profile, then select the new preset for a new session:')
console.log(`  pnpm dsh --profile ${profile}`)
console.log(`  preset: ${presetId}`)

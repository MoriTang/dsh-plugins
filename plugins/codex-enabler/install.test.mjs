import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  createCodexPreset,
  enableCodexTool,
  resolveDshHome,
  validatePresetId,
} from './install-lib.mjs'

const COMPOSITION = `- id: delegation
  name: cordis:group
  config:
    - id: tool-subagent-codex
      name: '@deepseek-ai/dsh-tool-subagent'
      disabled: true
      config:
        provider: codex
    - id: tool-subagent-claude-code
      name: '@deepseek-ai/dsh-tool-subagent'
      disabled: true
`

test('enableCodexTool changes only the Codex row', () => {
  const edited = enableCodexTool(COMPOSITION)
  assert.equal(edited.match(/disabled: true/g)?.length, 1)
  assert.match(edited, /tool-subagent-claude-code[\s\S]*?disabled: true/)
})

test('enableCodexTool rejects an incompatible source preset', () => {
  assert.throws(() => enableCodexTool('- id: tool-bash\n'), /expected one tool-subagent-codex row/)
})

test('createCodexPreset creates an enabled copy and preserves it on rerun', () => {
  const root = mkdtempSync(join(tmpdir(), 'codex-enabler-test-'))
  try {
    const sourceDir = join(root, 'standard')
    const targetDir = join(root, 'user', 'standard-codex')
    mkdirSync(sourceDir)
    writeFileSync(join(sourceDir, 'agent.cordis.yml'), COMPOSITION)
    writeFileSync(join(sourceDir, 'preset.yml'), 'name: Standard\n')

    assert.equal(createCodexPreset({ sourceDir, targetDir, displayName: 'Standard + Codex' }).created, true)
    assert.equal(
      readFileSync(join(targetDir, 'agent.cordis.yml'), 'utf8').match(/disabled: true/g)?.length,
      1,
    )
    assert.equal(
      readFileSync(join(targetDir, 'preset.yml'), 'utf8'),
      'name: "Standard + Codex"\ndescription: "Standard coding agent with the Codex subagent tool."\n',
    )
    assert.equal(createCodexPreset({ sourceDir, targetDir, displayName: 'Standard + Codex' }).created, false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('resolveDshHome honors a non-empty DSH_HOME', () => {
  assert.equal(resolveDshHome({ DSH_HOME: '/tmp/custom-dsh-home' }), '/tmp/custom-dsh-home')
})

test('preset ids use the Harness preset directory grammar', () => {
  assert.doesNotThrow(() => validatePresetId('standard-codex2'))
  assert.throws(() => validatePresetId('../standard'), /invalid preset id/)
})

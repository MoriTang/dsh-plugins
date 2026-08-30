/** Installer helpers for creating a Codex-enabled user agent preset. */

import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'

const COMPOSITION_FILE = 'agent.cordis.yml'
const METADATA_FILE = 'preset.yml'
const CODEX_ROW = /^([ \t]*)- id: tool-subagent-codex[ \t]*$/
const DISABLED_TRUE = /^[ \t]*disabled:[ \t]*true[ \t]*$/
const ROW_START = /^([ \t]*)- id:/

/**
 * Resolve the same Harness home precedence as dsh: DSH_HOME, then ~/.dsh.
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} env environment values.
 * @returns {string} the absolute Harness home.
 */
export function resolveDshHome(env = process.env) {
  const configured = env.DSH_HOME
  return resolve(configured !== undefined && configured.trim() !== ''
    ? configured
    : join(homedir(), '.dsh'))
}

/**
 * Reject ids that cannot be safe preset directory names.
 * @param {string} id candidate preset id.
 * @returns {void}
 */
export function validatePresetId(id) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) {
    throw new Error(`invalid preset id ${JSON.stringify(id)}; use lowercase letters, digits, and hyphens`)
  }
}

/**
 * Enable exactly the Codex tool row in a copied agent composition.
 * @param {string} source source composition.
 * @returns {string} the edited composition.
 */
export function enableCodexTool(source) {
  const lines = source.split('\n')
  const rowIndexes = lines.flatMap((line, index) => CODEX_ROW.test(line) ? [index] : [])
  if (rowIndexes.length !== 1) {
    throw new Error(`expected one tool-subagent-codex row, found ${rowIndexes.length}`)
  }

  const start = rowIndexes[0]
  const rowIndent = CODEX_ROW.exec(lines[start])[1].length
  let end = lines.length
  for (let index = start + 1; index < lines.length; index += 1) {
    const match = ROW_START.exec(lines[index])
    if (match !== null && match[1].length <= rowIndent) {
      end = index
      break
    }
  }

  const disabledIndexes = []
  for (let index = start + 1; index < end; index += 1) {
    if (DISABLED_TRUE.test(lines[index])) disabledIndexes.push(index)
  }
  if (disabledIndexes.length !== 1) {
    throw new Error(`expected tool-subagent-codex to contain one "disabled: true", found ${disabledIndexes.length}`)
  }
  lines.splice(disabledIndexes[0], 1)
  return lines.join('\n')
}

/**
 * Return whether an existing composition already grants the Codex tool.
 * @param {string} source source composition.
 * @returns {boolean} true when the row is enabled.
 */
export function hasEnabledCodexTool(source) {
  const lines = source.split('\n')
  const rowIndexes = lines.flatMap((line, index) => CODEX_ROW.test(line) ? [index] : [])
  if (rowIndexes.length !== 1) {
    throw new Error('expected one tool-subagent-codex row, found ' + rowIndexes.length)
  }

  const start = rowIndexes[0]
  const rowIndent = CODEX_ROW.exec(lines[start])[1].length
  let end = lines.length
  for (let index = start + 1; index < lines.length; index += 1) {
    const match = ROW_START.exec(lines[index])
    if (match !== null && match[1].length <= rowIndent) {
      end = index
      break
    }
  }
  const disabledCount = lines.slice(start + 1, end).filter(line => DISABLED_TRUE.test(line)).length
  if (disabledCount > 1) {
    throw new Error('expected tool-subagent-codex to contain at most one "disabled: true", found ' + disabledCount)
  }
  return disabledCount === 0
}

/**
 * Copy one shipped preset into the user root and grant only its Codex tool.
 * An existing enabled target is preserved; every other existing target fails.
 * @param {{ sourceDir: string, targetDir: string, displayName: string }} options paths and display name.
 * @returns {{ created: boolean, targetDir: string }} creation result.
 */
export function createCodexPreset({ sourceDir, targetDir, displayName }) {
  const targetComposition = join(targetDir, COMPOSITION_FILE)
  if (existsSync(targetDir)) {
    if (existsSync(targetComposition)
      && hasEnabledCodexTool(readFileSync(targetComposition, 'utf8'))) {
      return { created: false, targetDir }
    }
    throw new Error(`preset target already exists and was not created by codex-enabler: ${targetDir}`)
  }

  const parent = dirname(targetDir)
  mkdirSync(parent, { recursive: true })
  const temporaryRoot = mkdtempSync(join(parent, '.codex-enabler-'))
  const temporaryPreset = join(temporaryRoot, basename(targetDir))
  try {
    cpSync(sourceDir, temporaryPreset, { recursive: true, errorOnExist: true })
    const composition = readFileSync(join(temporaryPreset, COMPOSITION_FILE), 'utf8')
    writeFileSync(join(temporaryPreset, COMPOSITION_FILE), enableCodexTool(composition))
    writeFileSync(
      join(temporaryPreset, METADATA_FILE),
      `name: ${JSON.stringify(displayName)}\ndescription: ${JSON.stringify('Standard coding agent with the Codex subagent tool.')}\n`,
    )
    renameSync(temporaryPreset, targetDir)
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true })
  }
  return { created: true, targetDir }
}

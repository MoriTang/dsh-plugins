/**
 * One-command Codex integration installer.
 *
 * Runs the three steps the manual flow needs, in order:
 *   1. install @deepseek-ai/dsh-subagent-codex into the profile (link: —
 *      its workspace:* deps resolve inside the harness checkout);
 *   2. install @openai/codex into the profile (registry — link: deps do not
 *      pull transitive deps, so the runtime must be explicit);
 *   3. install THIS bundle (link:) so its dsh.bundle patch registers the
 *      provider config + re-enables tool-subagent.
 *
 * Usage:  node install.mjs <profile-name> [harness-checkout-path]
 */
import { execSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const profile = process.argv[2] ?? 'web'
const here = dirname(fileURLToPath(import.meta.url))
// Harness checkout: default to the sibling of the dsh-plugins workspace.
const harness = process.argv[3] ?? resolve(here, '../../../deepseek-harness')

const run = (cmd) => {
  console.log(`$ ${cmd}`)
  execSync(cmd, { stdio: 'inherit', cwd: harness })
}

console.log(`—— Codex 一键接入（profile: ${profile}）——`)
// 1. 官方 subagent-codex bundle（provider 注册 + workspace 依赖）
run(`pnpm dsh plugin --profile ${profile} add ${resolve(harness, 'packages/subagent/subagent-codex')}`)
// 2. @openai/codex 运行时（link 不装传递依赖，需显式）
run(`cd ${resolve(process.env.HOME, '.dsh/profiles', profile)} && pnpm add @openai/codex@0.147.0`)
// 3. 本 bundle（provider config + tool 启用）
run(`pnpm dsh plugin --profile ${profile} add ${here}`)

console.log('\n✅ 完成！重启 profile 后生效：')
console.log(`  pnpm dsh --profile ${profile}`)

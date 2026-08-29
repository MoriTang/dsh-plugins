# codex-enabler

DeepSeek Harness 的**一键 Codex 接入** bundle：运行一个安装脚本，即完成
Codex subagent 提供方注册、`@openai/codex` 运行时依赖、以及模型可见的
`subagent_codex` 工具启用。

## 一键接入

```sh
node /Users/mori/src/dsh/plugins/codex-enabler/install.mjs web
```

（`web` 是 profile 名，可换成你自己的。默认假设 harness checkout 在
`../../../deepseek-harness`，也可作为第二个参数传入。）

安装后**重启 profile**，Codex 即接入完成。模型在对话中即可调用
`subagent_codex` 工具委派任务。

## 它做了什么（install.mjs 自动完成）

| 步骤 | 手动方式 | 一键脚本 |
|---|---|---|
| 注册 Codex provider | 手动装 `@deepseek-ai/dsh-subagent-codex` | ✅ 自动 |
| 装 `@openai/codex` 运行时 | 手动 `pnpm add @openai/codex` | ✅ 自动 |
| 配置 provider（never 模式） | 手动 patch config | ✅ bundle patch 自动 |
| 启用模型工具 `subagent_codex` | 手动覆盖 `tool-subagent` 行 | ✅ bundle patch 自动 |

## 为什么需要三步（而不是一个包）

pnpm 的 `link:` 语义决定了「一个包自动带入全部依赖」做不到：

- `@deepseek-ai/dsh-subagent-codex` 声明了 `workspace:*` 依赖，**只能以
  `link:` 形式存在**（依赖在 harness checkout 里解析）
- `link:` 不递归安装目标的 dependencies，所以 `@openai/codex`（registry 包）
  **必须显式装进 profile**
- `dsh plugin add` 一次只处理一个包

因此 `install.mjs` 顺序执行三条命令完成接入；本 bundle 的 `dsh.bundle`
patch 层负责 provider 配置和 tool 启用，安装后自动生效。

## 前置条件

- 本机 Codex 已登录（`~/.codex/auth.json`）
- 本机有 harness checkout（默认 `../../../deepseek-harness`）

## 工作原理

```
dsh 主模型 → subagent_codex 工具
  → codex provider（@deepseek-ai/dsh-subagent-codex）
    → spawn @openai/codex app-server --stdio
      → Codex 独立临时线程执行（复用 ~/.codex 认证与配置）
      → 返回 final_answer
```

- 模型/推理强度由本机 `~/.codex/config.toml` 决定（默认 `gpt-5.6-sol` + `high`）
- `permissionMode: never`：非交互、自动拒绝审批、走原生沙箱
- 一次性线程：每次委派新进程 + 新临时线程，独立 token 上下文

## 配置调整

改 `permissionMode`（`approve-for-me`、`dangerously-bypass-approvals-and-sandbox`）
或模型，编辑本插件的 `cordis.patch.yml` 或 profile 的 `cordis.patch.yml`
覆盖对应行，保存后 host 半热生效。

## 卸载

```sh
cd /Users/mori/src/deepseek-harness
pnpm dsh plugin --profile web remove dsh-codex-enabler
pnpm dsh plugin --profile web remove @deepseek-ai/dsh-subagent-codex
cd ~/.dsh/profiles/web && pnpm remove @openai/codex
```

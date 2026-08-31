# codex-enabler

`codex-enabler` 会安装 DeepSeek Harness 官方 Codex Provider Bundle，并创建一个单独的智能体预设，使模型可以使用 `subagent_codex` 工具。Provider 仍是宿主能力；生成的预设会授予会话访问该能力的权限。

## 先决条件

运行安装程序之前，请确保：

- Node.js 和 pnpm 的版本与所选的 DeepSeek Harness 检出版本兼容，并且 `pnpm` 位于 `PATH` 中；
- 该检出目录的依赖项已经安装，而且可以在其中成功运行 `pnpm dsh`；
- 当前用户对 `<dshHome>/profiles/<profile>` 和 `<dshHome>/.agent-presets` 有写权限；
- 已经为将要运行 Harness 的同一个操作系统用户，以及相同的 `HOME`/`CODEX_HOME` 状态配置好 Codex 身份验证。

如果设置了 `DSH_HOME`，且其值至少包含一个非空白字符，就会将该值用作 `<dshHome>`。如果 `DSH_HOME` 未设置、为空或仅包含空白字符，则回退到 `~/.dsh`。

## 安装

在 `dsh` 仓库根目录中，使用默认的同级检出目录 `../deepseek-harness` 时，运行：

```sh
node plugins/codex-enabler/install.mjs web
```

参数为 `[profile] [harness-checkout] [preset-id]`。它们的默认值依次为 `web`、与本仓库同级的 `deepseek-harness` 检出目录和 `standard-codex`。例如，要显式指定这三个参数，可运行：

```sh
node plugins/codex-enabler/install.mjs web ../deepseek-harness my-codex
```

安装程序会：

1. 从 `<dshHome>/profiles/<profile>/package.json` 读取已注册的 Bundle 包名；
2. 如果缺少官方 Bundle `@deepseek-ai/dsh-subagent-codex`，则添加它；随后，如果缺少配套 Bundle `dsh-codex-enabler`，则添加它；
3. 将 Harness 自带的 `standard` 预设复制到 `<dshHome>/.agent-presets/<preset-id>`；
4. 在复制得到的 `agent.cordis.yml` 中，从唯一的 `tool-subagent-codex` 行删除唯一一个字面量 `disabled: true`；其他所有工具行均原样复制；
5. 无论 `<preset-id>` 是什么，都将 `preset.yml` 替换为固定的显示名称 `Standard + Codex` 和描述 `Standard coding agent with the Codex subagent tool.`。

Bundle 注册仅执行“缺少时添加”。安装程序既不验证也不重新排列已经注册的 Bundle。配套 Bundle 依赖官方 Bundle 先完成注册，因为前者的 `subagent-codex` 加载器行会修改后者创建的 Provider 行。安装后，请检查 `<dshHome>/profiles/<profile>/package.json` 中的 `dsh.profile.bundles`，确认 `@deepseek-ai/dsh-subagent-codex` 位于 `dsh-codex-enabler` 之前。对于此前已经注册但顺序相反的情况，安装程序不会自动修复。

预设操作绝不会覆盖已有的目标目录。只有当 `<dshHome>/.agent-presets/<preset-id>/agent.cordis.yml` 恰好包含一个 `tool-subagent-codex` 行，且该行不包含字面量 `disabled: true` 时，重新运行安装程序才会将其视为已安装。该检查不会验证 `preset.yml`、目录来源，也不会验证它是否等同于当前随 Harness 提供的 `standard` 预设。任何未通过检查的现有目标都会导致安装中止；组合解析器报告的结构验证错误不一定会包含目标路径。

安装后请重启该配置档案，然后在创建会话时选择 `<preset-id>`。现有会话会继续使用其启动时采用的预设和工具集。

## 组成

各层名称有意设计为彼此不同：

| 层级 | 确切名称 | 职责 |
|---|---|---|
| 官方 Bundle 包 | `@deepseek-ai/dsh-subagent-codex` | 注册宿主 Provider 行 |
| 宿主加载器行 id | `subagent-codex` | 此配套 Bundle 修改的行 |
| Provider 注册表名称 | `codex` | 预设的工具行所选择的 Provider |
| 智能体预设行 id | `tool-subagent-codex` | 在复制的预设中授予委派工具 |
| 模型可见工具名 | `subagent_codex` | DeepSeek 模型调用的工具 |

调用路径如下：

```text
DeepSeek model
  -> subagent_codex model-facing tool
  -> tool-subagent-codex row in the selected agent preset
  -> codex Provider in the Host registry
  -> subagent-codex Host loader row
  -> package-local @openai/codex app-server --stdio
  -> one ephemeral Codex thread
  -> final answer returned through the subagent result
```

可执行程序来自 Provider 包中固定的、包内本地的 `@openai/codex` 依赖项（`0.149.1`），而不是来自机器 `PATH` 中的 Codex 可执行程序。机器仅提供当前运行用户环境中可用的 Codex 身份验证和原生配置状态，包括 `HOME` 和 `CODEX_HOME`。

## 身份验证与权限

Provider 不会登录 Codex、创建账户、信任项目或重写 Codex 原生设置。请在启动 Harness 之前配置好身份验证和所有必需的原生设置。

`permissionMode` 控制此 Provider 实例创建的每个 Codex 线程所使用的无人值守审批和沙箱字段：

| 值 | 行为 |
|---|---|
| `never` | 字段层面仅设置 `approvalPolicy: never`，并省略 `sandbox` 字段，因此采用 Codex 原生默认沙箱；实际效果是工作区只读。由于从不发起审批，写文件会失败。 |
| `approve-for-me` | 使用自动审批审查和可写工作区沙箱（`approvalPolicy: on-request`、`approvalsReviewer: auto_review`、`sandbox: workspace-write`）。 |
| `dangerously-bypass-approvals-and-sandbox` | 禁用审批与沙箱强制措施（`approvalPolicy: never`、`sandbox: danger-full-access`）；仅应在确实需要完整宿主访问权限时使用。 |

在子进程启动之前，父进程环境中具有凭据特征的变量会被清除。如果子进程需要 API 密钥或其他被清除的凭据，请通过 Provider 的 `env` 配置显式传入；不要假定只要在 Harness 进程环境中导出这些变量，就会将其转发给 Codex。

## 配置

当 Bundle 顺序正确时，此配套 Bundle 会在官方 Provider Bundle 之后应用，并以其现有的 `subagent-codex` 加载器行为目标。它会将 Provider 注册表名称设为 `codex`，并将默认 `permissionMode` 设为 `never`。

要覆盖 Provider 配置，请在配置档案的 `cordis.patch.yml` 中添加一个顺序更靠后的条目：

```yaml
- id: subagent-codex
  config:
    providerName: codex
    permissionMode: approve-for-me
```

省略 `model` 时，以 Codex 原生的模型选择为准。仅当所选 Codex 账户支持相应模型时才添加 `model` 字段；Provider 会原样传递显式值，不会发现模型、重写别名或选择回退模型。

配置档案补丁的编辑会在 `web` 配置档案中实时重新加载。对已安装 Bundle 补丁或包版本的更改则需要重启配置档案。

## 故障与恢复

安装不是事务性的。添加 Bundle 和生成预设并不共享回滚机制：如果其中任一步骤失败，之前已经成功完成的步骤会予以保留。重新运行或修复安装之前，请检查配置档案清单和预设目标。

发生部分失败后，请先纠正 Bundle 顺序。重新运行时只会添加缺少的 Bundle，并且只有在现有预设通过上述严格限定的组合检查时才会接受它。如果预设目标未通过该检查，请先检查它并按需保留其内容，然后选择另一个 `<preset-id>`，或者先删除该目标再重新运行。

对于 Harness 检出目录，安装程序只检查 `pnpm-workspace.yaml` 是否存在。它不会预先检查构建产物、官方 Provider 目录或随 Harness 提供的 `standard` 预设目录。因此，即使安装程序成功退出，也不能保证第一次调用 `subagent_codex` 会成功：不受支持的平台、被省略的可选依赖项或缺失的 Codex 原生载荷，都可能在首次委派启动 Provider 时才暴露问题。

## 卸载

在采用默认同级检出目录布局的情况下，从 `dsh` 仓库根目录运行：

```sh
cd ../deepseek-harness
pnpm dsh plugin --profile web remove dsh-codex-enabler
pnpm dsh plugin --profile web remove @deepseek-ai/dsh-subagent-codex
```

移除这些 Bundle 不会移除安装程序生成的预设。该预设是由安装程序生成的用户根数据，并非用户编写的数据。确认不再有新会话需要使用它之后，请另行删除 `<dshHome>/.agent-presets/<preset-id>`。

# dsh-plugins — DeepSeek Harness 外部插件仓库

本仓库存放基于 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
开发的**外部（out-of-tree）插件**。插件在 harness 官方仓库之外独立开发和维护，
通过配置层挂载进运行中的 dsh。

## 背景：为什么是"外部"插件

- DeepSeek Harness 的 `@deepseek-ai/*` 工作区包**不发布到 npm registry**，
  因此外部插件通过 `link:` 协议把依赖指向本机的 harness checkout。
- 本仓库默认假定 harness checkout 位于同级目录 `../deepseek-harness`
  （即本仓库所在目录旁的 harness 项目目录），各插件 `package.json` 中的
  `link:` 相对路径均基于该布局。

## 目录结构

```
dsh-plugins/
├── plugins/
│   ├── greet-tool/        # 示例插件：可配置的 greet 工具（新插件的起点模板）
│   ├── cost-balance/      # 会话消耗金额 + 账户余额实时显示（composer dock）
│   ├── usage-heatmap/     # 设置页：GitHub 风格每日 token 消耗热力图
│   ├── codex-enabler/     # 一键 Codex subagent 接入
│   └── tool-audit/        # 工具调用审计：耗时/结果/失败/超时（composer dock）
└── README.md
```

## 插件索引

### `greet-tool` — 示例工具插件

- **类型**：host-only · 工具
- **功能**：注册一个 `greet` 工具，通过 `Config` 配置问候语。
- **说明**：最小的完整插件范例，是开发新插件时的起点模板。
- **安装**：patch 层插入行（见[快速开始](#快速开始)），`pnpm install` + 类型检查即可用。
- **文档**：[`plugins/greet-tool/README.md`](plugins/greet-tool/README.md)

### `cost-balance` — 会话消耗与余额

- **类型**：双半插件（host + client）
- **功能**：
  - **会话消耗金额**：监听每次 LLM 请求的 usage 事件，按配置单价折成金额，实时累计
  - **账户余额**：周期调用 DeepSeek `GET /user/balance`，显示在输入框下方
- **UI**：`conversation.composer.dock` 插槽，常驻读条
  （`cost ¥0.0012 · 12.3K in · 4.5K out · balance ¥438.76`）
- **数据通道**：消耗金额走 session projection（host 纯事件折叠 → `useProjection`），
  余额走 `/cost-balance/balance` 路由（client 轮询）。
- **测试**：7 个用例覆盖投影折叠（累计/同 step 替换/成本推导/模式一致）（`tests/`）。
- **文档**：[`plugins/cost-balance/README.md`](plugins/cost-balance/README.md)

### `usage-heatmap` — 每日 token 热力图

- **类型**：双半插件（host + client）
- **功能**：
  - **GitHub 风格热力图**：设置菜单「Usage」页，最近一年每日 token 消耗，
    越浅越亮 = 越多（绿色系渐变），hover 显示按模型（v4-pro/v4-flash）分桶
  - **汇总卡片**：Total balance、全周期 Token 总量
- **数据通道**：host 监听 `session/event` 按天聚合 + 按 `request/header` 归模型，
  启动时从持久化 session 日志回填历史；client 经 `/usage-heatmap/history` 轮询。
- **持久化**：`$DSH_HOME/usage-heatmap/daily-usage.json`（原子写入）。
- **测试**：11 个用例覆盖 daily-usage 折叠/归因/替换/持久化不变量（`tests/`）。
- **文档**：[`plugins/usage-heatmap/README.md`](plugins/usage-heatmap/README.md)

### `codex-enabler` — Codex Provider 与专用 preset 接入

- **类型**：bundle（安装脚本 + 配置层）
- **功能**：安装官方 Codex Provider、配置 Host 行，并复制出只对所选会话
  授权 `subagent_codex` 的 `standard-codex` agent preset。官方 Provider
  包持有匹配的 `@openai/codex` 版本，不再安装第二份运行时。
- **安装**：

  ```sh
  node plugins/codex-enabler/install.mjs web
  ```

- **使用**：重启 profile 后，为新会话选择 `standard-codex`；既有会话的
  preset 与工具集不变。
- **文档**：[`plugins/codex-enabler/README.md`](plugins/codex-enabler/README.md)

### `tool-audit` — 工具调用审计（耗时/结果/失败/超时）

- **类型**：双半插件（host + client）
- **功能**：
  - **调用账本**：记录每次模型工具调用的耗时、结算结果（成功/失败/中止/
    超时）、慢调用标记，composer dock 实时滚动展示
  - **失败/超时可见**：红 = 失败、灰 = 中止、琥珀 = 超时/慢调用，悬停看
    callId 与 error code
  - **可选兜底中止**：`abortAfterMs` 配置后，仅对未声明自身 `timeoutMs`
    预算的工具兜底中止（默认关闭，不重复官方 timeout 策略）
- **数据通道**：host 在 `tools/execute` 计时、`tools/result` 提交权威结算
  到内存账本，client 轮询 `/tool-audit/recent`（按 session 过滤）。
- **测试**：纯核心 + host 集成共 16 个用例（`tests/*.test.ts`）。
- **文档**：[`plugins/tool-audit/README.md`](plugins/tool-audit/README.md)

## 快速开始

### 1. 安装依赖

每个插件是独立的 pnpm 项目，`@deepseek-ai/*` 依赖通过 `link:` 指向 harness
checkout：

```sh
cd plugins/greet-tool
pnpm install
```

### 2. 加载插件（两种方式）

**方式 A：热加载（推荐，无需重启）**

把插件行写入 web profile 的用户 patch 层
（`~/.dsh/profiles/web/cordis.patch.yml`）：

```yaml
- insert:
    - id: greet-tool
      name: '/绝对路径/到/本仓库/plugins/greet-tool/src/index.ts'
      config:
        greeting: 'Hello'
```

`dsh web` 运行期间该文件被 config-only HMR 监听，**保存即生效**，插件立即
挂载，无需重启服务。修改 `config` 值同样实时生效；删除该行则卸载插件。

**方式 B：启动时通过 `--patch` overlay 加载**

```sh
cd /绝对路径/到/deepseek-harness
pnpm dsh web --patch /绝对路径/到/本仓库/plugins/greet-tool/cordis.yml
```

> **注意**：`--patch` overlay 只在启动时解析一次，运行中编辑它**不会**触发
> 热重载；热加载请使用方式 A 的 `cordis.patch.yml` 层。

### 3. 验证

在 Web UI（`http://127.0.0.1:3080`）让模型调用 `greet` 工具，例如：

> Use the greet tool to greet Ada.

模型应收到工具结果 `Hello, Ada!`。

## 开发新插件

1. 复制 `plugins/greet-tool` 作为起点模板。
2. 插件模块形态（`name` / `inject` / `apply`）、Schemastery `Config` schema、
   `ctx.tools` 注册均遵循官方教程：
   - [构建工具插件](https://deepseek-harness.github.io/docs/user/develop/basic/tool)
   - [插件配置](https://deepseek-harness.github.io/docs/user/develop/basic/config)
   - [工具编写参考](https://deepseek-harness.github.io/docs/cookbook/adding-a-tool)
3. 类型检查：

```sh
cd plugins/<your-plugin>
pnpm exec tsc --noEmit
```

## 已知限制

- **web 下修改插件源码不会热重载**：web profile 禁用了模块级 HMR（`hmr` 行
  `disabled: true`），改 `src/index.ts` 后需重启 `dsh web`。profile 或
  Harness home 的用户 patch 会热重载；已安装 bundle 自带的 patch 修改后需重启。
- **GUI 无法开关插件**：Web UI 的 Plugins 设置页只渲染已注册插件的配置卡片，
  没有运行时启用/停用操作。
- **加载方式分两类**：直接以 patch 引用源码的插件（如 `greet-tool`）的
  `name` 需是**绝对路径**（patch 不改变模块解析基准目录），换机器需调整；
  以**包名**挂载的插件（`cost-balance`、`usage-heatmap`、`tool-audit`）需要
  先把插件目录 `link:` 进 profile 的 `package.json` 依赖并 `pnpm install`，
  再在 `cordis.patch.yml` 里用包名插入行；bundle 插件（`codex-enabler`）
  通过 `dsh plugin add` 安装、`cordis.patch.yml` 覆盖配置。

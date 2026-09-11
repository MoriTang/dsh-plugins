# dsh-plugins — DeepSeek Harness 外部插件仓库

本仓库是基于 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
开发的**外部（out-of-tree）插件目录**。每个已拆分插件在独立 Git 仓库中开发和
发布；尚未拆分的插件暂时保留在 `plugins/`，完成迁移后本仓库将只保留索引。

## 背景：为什么是"外部"插件

- DeepSeek Harness 的 `@deepseek-ai/*` 工作区包**不发布到 npm registry**，
  因此外部插件通过 `link:` 协议把依赖指向本机的 harness checkout。
- `plugins/` 中尚未拆分的项目默认假定 harness checkout 位于同级目录
  `../deepseek-harness`；已拆分项目的开发布局与安装方式由各自仓库说明。

## 目录结构

```
dsh-plugins/
├── plugins/
│   ├── cost-balance/      # 会话消耗金额 + 账户余额实时显示（composer dock）
│   ├── codex-enabler/     # 一键 Codex subagent 接入
│   └── tool-audit/        # 工具调用审计：耗时/结果/失败/超时（composer dock）
└── README.md
```

## 插件索引

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
- **独立仓库**：[`MoriTang/dsh-usage-heatmap`](https://github.com/MoriTang/dsh-usage-heatmap)
- **安装**：clone 独立仓库后运行
  `pnpm dsh plugin --profile web add /绝对路径/到/dsh-usage-heatmap`。

### `neubrutalism-theme` — Neubrutalism Web UI 主题

- **类型**：bundle + browser client
- **功能**：通过主题 token 与可卸载全局样式，为完整 Web GUI 应用 2px 控件描边、
  3px 容器描边、方角、零模糊硬阴影、纯色强调面和按钮按压反馈。
- **字体**：内联 Syne、Space Grotesk、Inter 与 Space Mono 的本地 WOFF2，
  浏览器运行时不请求外部字体服务。
- **独立仓库**：[`MoriTang/dsh-neubrutalism-theme`](https://github.com/MoriTang/dsh-neubrutalism-theme)
- **安装**：clone 独立仓库后运行
  `pnpm dsh plugin --profile web add /绝对路径/到/dsh-neubrutalism-theme`。

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

## 开发新插件

1. 插件模块形态（`name` / `inject` / `apply`）、Schemastery `Config` schema、
   `ctx.tools` 注册均遵循官方教程：
   - [构建工具插件](https://deepseek-harness.github.io/docs/user/develop/basic/tool)
   - [插件配置](https://deepseek-harness.github.io/docs/user/develop/basic/config)
   - [工具编写参考](https://deepseek-harness.github.io/docs/cookbook/adding-a-tool)
2. 在插件项目中执行类型检查：

```sh
pnpm exec tsc --noEmit
```

## 已知限制

- **web 下修改插件源码不会热重载**：web profile 禁用了模块级 HMR（`hmr` 行
  `disabled: true`），改 `src/index.ts` 后需重启 `dsh web`。profile 或
  Harness home 的用户 patch 会热重载；已安装 bundle 自带的 patch 修改后需重启。
- **GUI 无法开关插件**：Web UI 的 Plugins 设置页只渲染已注册插件的配置卡片，
  没有运行时启用/停用操作。
- **加载方式取决于插件封装**：包插件安装后按包名挂载；`codex-enabler`
  等 bundle 插件通过 `dsh plugin add` 安装，并在 `cordis.patch.yml` 中覆盖配置。

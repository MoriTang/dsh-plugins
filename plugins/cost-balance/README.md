# cost-balance

基于 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的
外部（out-of-tree）双半插件：在 Web UI 实时显示**会话消耗金额**和
**账户余额**。

## 功能

- **会话消耗金额**：每次 LLM 请求结束时，把 provider 上报的
  token 用量（input / output / cache-read / cache-write）按配置单价折叠成
  金额，随会话实时累计。
- **账户余额**：周期调用 DeepSeek 官方
  [`GET /user/balance`](https://api-docs.deepseek.com/zh-cn/api/get-user-balance/)
  接口查询余额，在输入框下方常驻显示。
- **常驻显示**：读条挂在 `conversation.composer.dock` 插槽（内置 StatsLine
  旁边），格式如 `cost ¥0.0012 · 12.3K in · 4.5K out · balance ¥438.76`。

## 架构：两个数据通道

| 数据 | 通道 | 说明 |
|---|---|---|
| 消耗金额 | **session projection** | host 侧纯函数折叠 `usage` 事件 → token 分桶 + 金额，经 `session/projection` 帧实时推给浏览器；client 用 `useProjection('costBalance')` 读取。与内置 token 统计同一机制，零额外推送。 |
| 账户余额 | **webserver 路由** | 余额是外部账户事实，不能进 projection（纯事件折叠）也不能污染 durable 会话日志。host 周期查询并缓存，经 `/cost-balance/balance` 路由暴露；client 每 30s 轮询。 |

```
┌─ host (node) ────────────────────────────┐   ┌─ browser ─────────────────┐
│ sessionProjections.register(costBalance) │──▶│ useProjection('costBalance')│
│   apply: usage 事件 → 金额折叠            │   │   → 消耗金额              │
│                                           │   │                           │
│ setInterval → GET /user/balance (缓存)    │   │ setInterval → fetch       │
│ webServer /cost-balance/balance ────────▶│──▶│   /cost-balance/balance    │
└───────────────────────────────────────────┘   │   → 余额                  │
                                                └───────────────────────────┘
```

## 目录结构

```
plugins/cost-balance/
├── package.json          # 私有包；dsh.client 声明；exports["./client"]
├── tsconfig.json         # 编辑器类型检查
├── build.mjs             # esbuild 构建 host bundle + client bundle
├── src/
│   ├── index.ts          # host 半：projection 注册 + 余额查询 + 路由
│   ├── projection.ts     # costBalance 投影：usage → token/金额折叠
│   └── client/
│       ├── index.ts      # client 半：composer.dock 插槽注册
│       └── CostBalanceLine.tsx  # 显示组件（金额 + 余额）
└── lib/                  # 构建产物（host + client bundle，随仓库提交）
```

## 安装

`@deepseek-ai/*` 依赖通过 `link:` 指向本地 harness checkout
（`../../../deepseek-harness`）—— 工作区包不发布到 registry。

### 1. 构建产物（client bundle 必须已构建）

```sh
cd plugins/cost-balance
pnpm install          # 物化 link:-ed 依赖
node build.mjs        # 生成 lib/index.js + lib/client.js（需要 harness 内的 esbuild）
```

### 2. 安装到 web profile

```sh
# 从 harness checkout 运行，把本插件链接进 web profile 的 node_modules
cd <harness-checkout>   # 例如 ../deepseek-harness（本仓库同级目录）
pnpm dsh plugin --profile web add <本仓库>/plugins/cost-balance
```

### 3. 挂载

在 `~/.dsh/profiles/web/cordis.patch.yml` 追加：

```yaml
- insert:
    - id: cost-balance
      name: 'dsh-cost-balance'
      config:
        currency: '¥'
        apiKeyEnv: 'DEEPSEEK_API_KEY'
        baseURL: 'https://api.deepseek.com'
        refreshMs: 60000
        pricing:
          inputPerM: 2
          outputPerM: 8
          cacheReadPerM: 0.5
          cacheWritePerM: 2
```

保存即热加载（host 半）。刷新浏览器页面后，输入框下方出现消耗/余额读条。

## 配置

| 字段 | 默认 | 说明 |
|---|---|---|
| `pricing.inputPerM` | `2` | 未缓存输入，每百万 token 价格（`currency` 单位） |
| `pricing.outputPerM` | `8` | 输出，每百万 token 价格 |
| `pricing.cacheReadPerM` | `0.5` | 缓存命中读取，每百万 token 价格 |
| `pricing.cacheWritePerM` | `2` | 缓存写入，每百万 token 价格 |
| `currency` | `¥` | 价格与显示使用的货币符号 |
| `apiKeyEnv` | `DEEPSEEK_API_KEY` | API key 的凭证引用（环境变量名） |
| `baseURL` | `https://api.deepseek.com` | API 端点基址，`/user/balance` 追加其后 |
| `refreshMs` | `60000` | 余额刷新间隔（毫秒） |

价格表请对照 DeepSeek 当前官方价目调整；改配置保存即热生效（不需要重启）。

## 验证

- **余额**：`curl http://127.0.0.1:3080/cost-balance/balance` 应返回
  `{"balance":{"is_available":true,"balance_infos":[...]},"checkedAt":...,"lastError":null}`。
- **client bundle**：`curl http://127.0.0.1:3080/plugins/dsh-cost-balance/client.js` 应返回
  200 和 `window.__ModuleLoader__.load({...})`。
- **类型检查**：`cd plugins/cost-balance && pnpm exec tsc --noEmit`（或 harness 的 tsc）。

## 测试

```sh
cd plugins/cost-balance      # 从本仓库根目录
pnpm install
npm test
```

7 个用例覆盖 `costBalanceDefinition` 折叠语义：init 全零与货币透传、忽略
非 usage 事件、跨 step 累计、同 (turn, step) **替换**（含更小样本与相同样本
幂等）、cost 由当前总量按每百万单价推导（替换不漂移）、stateSchema /
wire.viewSchema 一致性。

## 已知限制

- **改 client 源码需重启**：web profile 禁用了模块级 HMR，修改
  `src/client/*` 后需重启 `dsh web` 并刷新页面；host 半（`src/index.ts`、
  `src/projection.ts`）与 `cordis.patch.yml` 配置编辑可热重载。
- **金额是估算**：单价由 `pricing` 配置决定，按 provider 上报的 token 精确
  计算，但价格本身需随官方价目手动维护；不保证与账单完全一致。
- **余额只读**：只查询展示，不含充值/消费操作；余额接口失败时保留上次
  成功值并记录 `lastError`。
- 插件 `name` 在 `cordis.patch.yml` 中必须是**包名**（`dsh-cost-balance`），
  因为 client modules 按包名扫描 `dsh.client` 声明；换机器后需重新
  `dsh plugin add` 并确认 profile 依赖可解析。

## 下一步

- [工具编写参考](https://deepseek-harness.github.io/docs/cookbook/adding-a-tool)
- [打包与安装](https://deepseek-harness.github.io/docs/user/develop/basic/publish)
- [添加设置卡片](https://deepseek-harness.github.io/docs/cookbook/adding-a-settings-card) —
  把单价表做成 Web 设置页可编辑

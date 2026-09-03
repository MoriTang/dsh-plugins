# tool-audit

基于 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的
外部（out-of-tree）插件：在**输入框下方的 dock** 展示当前会话最近的
**工具调用审计**——每个成功派发的工具调用的耗时、权威结算结果
（成功/失败/中止/超时）、慢调用标记，失败与超时用颜色区分，悬停可看
调用详情。

## 功能

- **工具调用审计账本**：记录每次**成功派发**（进入 `tools/execute` 结算）
  的模型工具调用的 callId、参数预览、开始时刻、墙钟耗时与结算结果，按
  会话分桶、内存有界保留（可配）。
- **慢调用标记**：超过 `slowThresholdMs`（默认 60s）的调用标记 `slow`，
  时长显示为琥珀色。
- **失败/中止/超时可见**：失败（红）、中止（灰）、超时（琥珀）一眼可辨，
  悬停行可看 error code（官方策略的 `TOOL_TIMEOUT`、本插件的
  `TOOL_AUDIT_TIMEOUT`、harness 取消码 `ABORTED` 等）。
- **可选兜底中止**：`abortAfterMs`（上限 ~24.8 天）只作用于**未声明自身
  `timeoutMs` 预算**的工具——超过该值即中止并替换为 `TOOL_AUDIT_TIMEOUT`
  错误结果（默认关闭；**协作式**：工具需响应 `exec.signal` 才算真正终止）。

> 与官方 timeout 策略的分工：harness 自带
> `@deepseek-ai/dsh-tool-call-timeout-policy` 按**工具声明的 `timeoutMs`**
> 强制预算；本插件不重复该机制，`abortAfterMs` 只是针对"未声明预算的工具"
> 的可选兜底（已声明预算的工具直接跳过本插件的 deadline，避免双重竞争）。
> 审计数据**不进入会话日志**——它绝不污染模型上下文。

## 架构

时长只能靠墙钟测量，因此计时挂在 **live `tools/execute` 包装器**上；但
**提交**发生在 `tools/result` 观察点——那是包装器归一化、调用方取消
（`ABORTED` 码替换）与 `tools/post-execute` 改写**之后**的权威冻结结果，
保证账本记录的是真实结算而非中间态。

```
┌─ host (node) ───────────────────────────────┐   ┌─ browser ───────────────────┐
│ tools/execute 包装器：计时 + 可选 deadline   │   │ conversation.composer.dock  │
│   → 按 exec.token stash 计时事实             │   │   └─ ToolAuditDock          │
│ tools/result 观察点：提交权威结算到           │   │       (单飞轮询 1.2s        │
│   ToolAuditLedger（按 sessionId 分桶、有界）  │   │        /tool-audit/recent)  │
│ webServer /tool-audit/recent?session=… ────▶│──▶│                            │
└──────────────────────────────────────────────┘   └────────────────────────────┘
```

## 接入

在你的 profile patch（如 `~/.dsh/profiles/web/cordis.patch.yml`）追加：

```yaml
- insert:
    - id: tool-audit
      name: 'dsh-tool-audit'
      config:
        slowThresholdMs: 60000   # 超过即标记 slow
        maxPerSession: 100       # 每个会话保留条数
        maxTotal: 1000           # 全进程保留条数
        # abortAfterMs: 120000   # 可选：仅对未声明 timeoutMs 的工具兜底中止
```

并把 `dsh-tool-audit` 加入 profile 的 `package.json` dependencies（`link:` 到
本目录），重启 profile 后生效。

## 构建与测试

```sh
cd plugins/tool-audit       # 从本仓库根目录
pnpm install
node build.mjs              # 生成 lib/index.js + lib/client.js
                            # esbuild 从同级 ../deepseek-harness 的 pnpm store
                            # 解析；可用环境变量 DSH_HARNESS 覆盖 checkout 路径
npm test                    # node --import tsx/esm --test tests/*.test.ts
```

纯核心（分类/账本/格式化）与 host 集成（execute→result 管线、权威结果覆盖、
deadline 跳过声明预算、路由校验）共 16 个用例。

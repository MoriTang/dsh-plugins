# tool-audit

基于 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的
外部（out-of-tree）插件：在**输入框下方的 dock** 展示当前会话最近的
**工具调用审计**——每个调用的耗时、结算结果（成功/失败/中止/超时）、
慢调用标记，失败与超时用颜色区分，悬停可看调用详情。

## 功能

- **工具调用审计账本**：记录每次模型工具调用的 callId、参数预览、开始
  时刻、墙钟耗时与结算结果，按会话分桶、内存有界保留（可配）。
- **慢调用标记**：超过 `slowThresholdMs`（默认 60s）的调用标记 `slow`，
  时长显示为琥珀色。
- **失败/中止/超时可见**：失败（红）、中止（灰）、超时（琥珀）一眼可辨，
  悬停行可看 error code（如 `TOOL_TIMEOUT`、`TOOL_AUDIT_TIMEOUT`）。
- **可选兜底中止**：`abortAfterMs` 设置后，超过该预算的工具调用会被
  中止并替换为 `TOOL_AUDIT_TIMEOUT` 错误结果（默认关闭）。

> 与官方 timeout 策略的分工：harness 自带
> `@deepseek-ai/dsh-tool-call-timeout-policy` 按**工具声明的 `timeoutMs`**
> 强制预算；本插件不重复该机制，`abortAfterMs` 只是针对"未声明预算的工具"
> 的可选兜底。审计数据**不进入会话日志**——它绝不污染模型上下文。

## 架构

时长只能靠墙钟测量，因此挂在 **live `tools/execute` 包装器**上，而不是
session-log 投影（日志事件没有时间戳）。

```
┌─ host (node) ─────────────────────────────┐   ┌─ browser ───────────────────┐
│ ctx.on('tools/execute') 包装器             │   │ conversation.composer.dock  │
│   计时 → 结算 → ToolAuditLedger            │   │   └─ ToolAuditDock          │
│     （按 sessionId 分桶、有界裁剪）         │   │       (1.2s 轮询            │
│ webServer /tool-audit/recent ────────────▶│──▶│        /tool-audit/recent)   │
│ 可选：armDeadline → TOOL_AUDIT_TIMEOUT 替换│   └─────────────────────────────┘
└────────────────────────────────────────────┘
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
        # abortAfterMs: 120000   # 可选：未声明预算的工具超过该值即中止
```

并把 `dsh-tool-audit` 加入 profile 的 `package.json` dependencies（`link:` 到
本目录），重启 profile 后生效。

## 测试

```sh
# 从 harness checkout 目录运行（tsx 可解析）
node --import tsx/esm --test \
  /Users/mori/src/dsh/plugins/tool-audit/tests/audit-core.test.ts
node --import tsx/esm --test \
  /Users/mori/src/dsh/plugins/tool-audit/tests/host-integration.test.ts
```

核心逻辑（分类/账本/格式化）与 host 包装器（signal 替换与恢复、超时替换、
路由）共 13 个用例。

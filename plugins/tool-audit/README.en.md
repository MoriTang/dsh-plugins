# tool-audit

An external (out-of-tree) plugin for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).
It shows a **tool-call audit readout** on the dock below the composer: every
recent DISPATCHED model tool call with its wall-clock duration, authoritative
settle outcome (success / failure / aborted / timeout), and a slow-call flag.
Failures and timeouts are color-coded; hover a row for call details.

## Features

- **Tool-call audit ledger**: Records each successfully dispatched model tool
  call (one that entered the `tools/execute` settlement path) — callId,
  argument preview, start time, wall-clock duration, and settle outcome —
  bucketed by session with bounded in-memory retention (configurable).
- **Slow-call flag**: Calls at or above `slowThresholdMs` (default 60 s) are
  flagged `slow` and their duration renders in amber.
- **Visible failures / aborts / timeouts**: red = failure, gray = aborted,
  amber = timeout (and slow). Hover a row to see the structured error code
  (the shipped policy's `TOOL_TIMEOUT`, this plugin's `TOOL_AUDIT_TIMEOUT`,
  harness cancellation codes such as `ABORTED`, …).
- **Optional blanket abort deadline**: `abortAfterMs` (capped at ~24.8 days)
  applies ONLY to tools that declare no `timeoutMs` of their own — calls past
  it are aborted and their result replaced with a `TOOL_AUDIT_TIMEOUT` error
  (off by default; **cooperative** — a tool must honor `exec.signal` to
  actually terminate).

> Division of labor with the official timeout policy: the harness ships
> `@deepseek-ai/dsh-tool-call-timeout-policy`, which enforces budgets declared
> by a tool via its own `timeoutMs`. This plugin does not duplicate that;
> `abortAfterMs` is only a safety net for tools that declare no budget (tools
> with a declared budget skip this plugin's deadline entirely, so the two never
> race). Audit data deliberately never enters the session log, so it can never
> pollute the model's context.

## Architecture

Durations require wall-clock measurement, so timing rides the **live
`tools/execute` wrapper**; the record is **committed at the `tools/result`
observer** — the authoritative frozen outcome AFTER wrapper normalization,
caller cancellation (`ABORTED` code substitution), and `tools/post-execute`
rewrites — so the ledger reflects what actually settled, not an intermediate
state.

```
┌─ host (node) ───────────────────────────────┐   ┌─ browser ───────────────────┐
│ tools/execute wrapper: time + optional       │   │ conversation.composer.dock  │
│   deadline → stash timing by exec.token      │   │   └─ ToolAuditDock          │
│ tools/result observer: commit authoritative  │   │       (single-flight 1.2 s  │
│   settle to ToolAuditLedger (per-session,    │   │        polling of            │
│   bounded)                                   │   │        /tool-audit/recent)  │
│ webServer /tool-audit/recent?session=… ────▶│──▶│                            │
└──────────────────────────────────────────────┘   └────────────────────────────┘
```

## Installation

Append an entry to your profile patch layer (e.g.
`~/.dsh/profiles/web/cordis.patch.yml`):

```yaml
- insert:
    - id: tool-audit
      name: 'dsh-tool-audit'
      config:
        slowThresholdMs: 60000   # calls at/above this are flagged slow
        maxPerSession: 100       # records kept per session
        maxTotal: 1000           # records kept process-wide
        # abortAfterMs: 120000   # optional: only for tools without their own timeoutMs
```

Then add `dsh-tool-audit` to the profile's `package.json` dependencies
(`link:` to this directory) and restart the profile.

## Build and tests

```sh
cd plugins/tool-audit        # from this repository's root
pnpm install
node build.mjs               # emits lib/index.js + lib/client.js; resolves esbuild
                             # from the sibling ../deepseek-harness pnpm store,
                             # overridable with the DSH_HARNESS environment variable
npm test                     # node --import tsx/esm --test tests/*.test.ts
```

16 cases covering the pure core (classification / ledger / formatting) and the
host integration (execute→result pipeline, authoritative-outcome override,
deadline skip for declared budgets, route validation).

# dsh-plugins — External Plugin Repository for DeepSeek Harness

English | [中文](README.zh.md)

This repository is a directory of **external (out-of-tree) plugins** developed
for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). Each
extracted plugin is developed and released from its own Git repository. Plugins
not yet extracted remain under `plugins/`; after migration this repository will
contain only the index.

## Background: Why "External" Plugins

- The DeepSeek Harness `@deepseek-ai/*` workspace packages **are not published to
  the npm registry**, so external plugins use the `link:` protocol to point their
  dependencies to a local harness checkout.
- Projects not yet extracted from `plugins/` assume by default that the Harness
  checkout is located at the sibling path `../deepseek-harness`. Each extracted
  project documents its own development layout and installation flow.

## Directory Structure

```
dsh-plugins/
├── plugins/
│   ├── cost-balance/      # Real-time session cost and account balance display (composer dock)
│   ├── codex-enabler/     # One-click Codex subagent integration
│   └── tool-audit/        # Tool-call audit: duration/outcome/failure/timeout (composer dock)
└── README.md
```

## Plugin Index

### `cost-balance` — Session Cost and Balance

- **Type**: host/client half plugin (host + client)
- **Functionality**:
  - **Session cost**: Listens for the usage event from each LLM request, converts
    usage into a monetary amount using the configured unit prices, and maintains a
    real-time running total
  - **Account balance**: Periodically calls DeepSeek `GET /user/balance` and
    displays the result below the input box
- **UI**: `conversation.composer.dock` slot with an always-visible status line
  (`cost ¥0.0012 · 12.3K in · 4.5K out · balance ¥438.76`)
- **Data channels**: Session cost uses session projection (pure event folding on
  the host → `useProjection`), while the balance uses the
  `/cost-balance/balance` route (client polling).
- **Tests**: 7 cases over the projection fold (accumulation / same-step
  replacement / cost derivation / schema consistency) (`tests/`).
- **Documentation**: [`plugins/cost-balance/README.md`](plugins/cost-balance/README.md)

### `usage-heatmap` — Daily Token Usage Heatmap

- **Type**: host/client half plugin (host + client)
- **Functionality**:
  - **GitHub-style heatmap**: Shows daily token usage for the past year on the
    "Usage" page in Settings. Lighter and brighter cells indicate higher usage
    (green gradient), and hovering shows usage grouped by model
    (v4-pro/v4-flash)
  - **Summary cards**: Total balance and total token usage across the entire period
- **Data channels**: The host listens for `session/event`, aggregates usage by
  day, and assigns models based on `request/header`. On startup, it backfills
  historical data from persisted session logs; the client polls
  `/usage-heatmap/history`.
- **Persistence**: `$DSH_HOME/usage-heatmap/daily-usage.json` (atomic writes).
- **Tests**: 11 cases over the daily-usage fold / attribution / replacement /
  persistence invariants (`tests/`).
- **Standalone repository**: [`MoriTang/dsh-usage-heatmap`](https://github.com/MoriTang/dsh-usage-heatmap)
- **Install**: Clone the standalone repository, then run
  `pnpm dsh plugin --profile web add /absolute/path/to/dsh-usage-heatmap`.

### `neubrutalism-theme` — Neubrutalism Web UI Theme

- **Type**: bundle + browser client
- **Functionality**: Applies theme tokens and removable global styles across the
  Web GUI, including 2px control outlines, 3px container outlines, square
  corners, zero-blur hard shadows, flat accent surfaces, and button press feedback.
- **Fonts**: Embeds local WOFF2 files for Syne, Space Grotesk, Inter, and Space
  Mono, with no browser request to an external font service.
- **Standalone repository**: [`MoriTang/dsh-neubrutalism-theme`](https://github.com/MoriTang/dsh-neubrutalism-theme)
- **Install**: Clone the standalone repository, then run
  `pnpm dsh plugin --profile web add /absolute/path/to/dsh-neubrutalism-theme`.

### `codex-enabler` — Codex Provider Integration with a Dedicated preset

- **Type**: bundle (installation script + configuration layer)
- **Functionality**: Installs the official Codex Provider, configures the Host
  entry, and creates a copy of the `standard-codex` agent preset that authorizes
  `subagent_codex` only for selected sessions. The official Provider package owns
  the matching `@openai/codex` version, so a second runtime is no longer installed.
- **Installation**:

  ```sh
  node plugins/codex-enabler/install.mjs web
  ```

- **Usage**: After restarting the profile, select `standard-codex` for new
  sessions. Existing sessions retain their preset and toolset.
- **Documentation**: [`plugins/codex-enabler/README.md`](plugins/codex-enabler/README.md)

### `tool-audit` — Tool-Call Audit (duration / outcome / failure / timeout)

- **Type**: dual-half plugin (host + client)
- **Functionality**:
  - **Call ledger**: Records every model tool call's wall duration and settle
    outcome (success / failure / aborted / timeout) with a slow-call flag,
    streamed live into the composer dock.
  - **Failures / timeouts visible**: red = failure, gray = aborted,
    amber = timeout/slow; hover for callId and the error code.
  - **Optional blanket abort**: with `abortAfterMs`, only tools without their
    own declared `timeoutMs` budget are aborted past it (off by default; does
    not duplicate the official per-tool `timeoutMs` policy).
- **Data channel**: the host times calls in `tools/execute` and commits the
  authoritative settle from `tools/result` into an in-memory ledger; the
  client polls `/tool-audit/recent` (session-scoped).
- **Tests**: 16 cases across the pure core and the host integration
  (`tests/*.test.ts`).
- **Documentation**: [`plugins/tool-audit/README.md`](plugins/tool-audit/README.md)

## Developing a New Plugin

1. Follow the official tutorials for the plugin module structure (`name` /
   `inject` / `apply`), the Schemastery `Config` schema, and `ctx.tools`
   registration:
   - [Building a Tool Plugin](https://deepseek-harness.github.io/docs/user/develop/basic/tool)
   - [Plugin Configuration](https://deepseek-harness.github.io/docs/user/develop/basic/config)
   - [Tool Development Reference](https://deepseek-harness.github.io/docs/cookbook/adding-a-tool)
2. Run a type check from the plugin project:

```sh
pnpm exec tsc --noEmit
```

## Known Limitations

- **Changes to plugin source code are not hot-reloaded under web**: The web
  profile disables module-level HMR (the `hmr` entry has `disabled: true`). After
  changing `src/index.ts`, you must restart `dsh web`. User patches in the profile
  or Harness home are hot-reloaded; changes to patches included with an installed
  bundle require a restart.
- **Plugins cannot be enabled or disabled from the GUI**: The Plugins settings
  page in the Web UI only renders configuration cards for registered plugins and
  provides no runtime enable/disable controls.
- **Loading depends on plugin packaging**: Package plugins are mounted by package
  name after installation; bundle plugins such as `codex-enabler` are installed
  through `dsh plugin add` and configured through overrides in
  `cordis.patch.yml`.

# dsh-plugins — External Plugin Repository for DeepSeek Harness

This repository contains **external (out-of-tree) plugins** developed for
[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). These plugins
are developed and maintained independently of the official harness repository and
are mounted into a running dsh instance through the configuration layer.

## Background: Why "External" Plugins

- The DeepSeek Harness `@deepseek-ai/*` workspace packages **are not published to
  the npm registry**, so external plugins use the `link:` protocol to point their
  dependencies to a local harness checkout.
- This repository assumes by default that the harness checkout is located in the
  sibling directory `../deepseek-harness` (the harness project directory next to
  this repository). The relative `link:` paths in each plugin's
  `package.json` are based on this layout.

## Directory Structure

```
dsh-plugins/
├── plugins/
│   ├── greet-tool/        # Example plugin: configurable greet tool (starter template for new plugins)
│   ├── cost-balance/      # Real-time session cost and account balance display (composer dock)
│   ├── usage-heatmap/     # Settings page: GitHub-style heatmap of daily token usage
│   ├── codex-enabler/     # One-click Codex subagent integration
│   └── tool-audit/        # Tool-call audit: duration/outcome/failure/timeout (composer dock)
└── README.md
```

## Plugin Index

### `greet-tool` — Example Tool Plugin

- **Type**: host-only · tool
- **Functionality**: Registers a `greet` tool with a greeting configurable through
  `Config`.
- **Description**: A minimal, complete plugin example and a starter template for
  developing new plugins.
- **Installation**: Insert an entry in the patch layer (see
  [Quick Start](#quick-start)); it is ready to use after `pnpm install` and type
  checking.
- **Documentation**: [`plugins/greet-tool/README.md`](plugins/greet-tool/README.md)

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
- **Documentation**: [`plugins/usage-heatmap/README.md`](plugins/usage-heatmap/README.md)

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

## Quick Start

### 1. Install Dependencies

Each plugin is an independent pnpm project. Its `@deepseek-ai/*` dependencies use
`link:` to point to the harness checkout:

```sh
cd plugins/greet-tool
pnpm install
```

### 2. Load a Plugin (Two Methods)

**Method A: Hot Loading (Recommended; No Restart Required)**

Add the plugin entry to the web profile's user patch layer
(`~/.dsh/profiles/web/cordis.patch.yml`):

```yaml
- insert:
    - id: greet-tool
      name: '/path/to/this/repo/plugins/greet-tool/src/index.ts'
      config:
        greeting: 'Hello'
```

While `dsh web` is running, this file is monitored by config-only HMR. **Changes
take effect as soon as the file is saved**: the plugin is mounted immediately,
with no service restart required. Changes to `config` values also take effect in
real time; removing the entry unloads the plugin.

**Method B: Load at Startup Using a `--patch` overlay**

```sh
cd /path/to/deepseek-harness
pnpm dsh web --patch /path/to/this/repo/plugins/greet-tool/cordis.yml
```

> **Note**: A `--patch` overlay is parsed only once at startup. Editing it while
> the application is running **does not** trigger hot reloading. For hot loading,
> use the `cordis.patch.yml` layer described in Method A.

### 3. Verify the Plugin

In the Web UI (`http://127.0.0.1:3080`), ask the model to invoke the `greet` tool,
for example:

> Use the greet tool to greet Ada.

The model should receive the tool result `Hello, Ada!`.

## Developing a New Plugin

1. Copy `plugins/greet-tool` as the starter template.
2. Follow the official tutorials for the plugin module structure (`name` /
   `inject` / `apply`), the Schemastery `Config` schema, and `ctx.tools`
   registration:
   - [Building a Tool Plugin](https://deepseek-harness.github.io/docs/user/develop/basic/tool)
   - [Plugin Configuration](https://deepseek-harness.github.io/docs/user/develop/basic/config)
   - [Tool Development Reference](https://deepseek-harness.github.io/docs/cookbook/adding-a-tool)
3. Run a type check:

```sh
cd plugins/<your-plugin>
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
- **There are two loading methods**: For source plugins (`greet-tool`,
  `cost-balance`, and `usage-heatmap`), `name` in the patch layer must be an
  **absolute path** (a patch does not change the module resolution base
  directory), so it must be updated when moving to another machine; bundle plugins
  (`codex-enabler`) are mounted by **package name**, installed through
  `dsh plugin add`, and configured through overrides in `cordis.patch.yml`.

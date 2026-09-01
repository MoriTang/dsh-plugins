# cost-balance

An external (out-of-tree) dual-half plugin based on
[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) that displays
the **session cost** and **account balance** in real time in the Web UI.

## Features

- **Session cost**: At the end of each LLM request, the plugin calculates the
  cost of the token usage reported by the provider (input / output / cache-read /
  cache-write) using the configured rates and accumulates it in real time for
  the session.
- **Account balance**: Periodically calls DeepSeek's official
  [`GET /user/balance`](https://api-docs.deepseek.com/zh-cn/api/get-user-balance/)
  endpoint to retrieve the balance and keeps it visible below the input box.
- **Persistent display**: The status line is attached to the
  `conversation.composer.dock` slot (next to the built-in StatsLine) and uses a
  format such as `cost ¥0.0012 · 12.3K in · 4.5K out · balance ¥438.76`.

## Architecture: Two Data Channels

| Data | Channel | Description |
|---|---|---|
| Session cost | **session projection** | A pure function on the host folds `usage` events into token buckets and a cost, then streams the result to the browser in real time via `session/projection` frames. The client reads it with `useProjection('costBalance')`. This uses the same mechanism as the built-in token statistics, with no additional push channel. |
| Account balance | **webserver route** | The balance is an external account fact, so it cannot be included in the projection (a pure event fold) or allowed to contaminate the durable session log. The host periodically retrieves and caches it, then exposes it through the `/cost-balance/balance` route; the client polls it every 30 seconds. |

```
┌─ host (node) ────────────────────────────┐   ┌─ browser ─────────────────────┐
│ sessionProjections.register(costBalance) │──▶│ useProjection('costBalance') │
│   apply: usage event → cost fold         │   │   → session cost             │
│                                           │   │                              │
│ setInterval → GET /user/balance (cached)  │   │ setInterval → fetch          │
│ webServer /cost-balance/balance ─────────▶│──▶│   /cost-balance/balance       │
└───────────────────────────────────────────┘   │   → account balance          │
                                                └──────────────────────────────┘
```

## Directory Structure

```
plugins/cost-balance/
├── package.json          # Private package; dsh.client declaration; exports["./client"]
├── tsconfig.json         # Editor type checking
├── build.mjs             # esbuild build for the host bundle + client bundle
├── src/
│   ├── index.ts          # host half: projection registration + balance retrieval + route
│   ├── projection.ts     # costBalance projection: usage → token/cost fold
│   └── client/
│       ├── index.ts      # client half: composer.dock slot registration
│       └── CostBalanceLine.tsx  # Display component (cost + balance)
└── lib/                  # Build artifacts (host + client bundle, committed to the repository)
```

## Installation

The `@deepseek-ai/*` dependencies use `link:` to reference a local harness checkout
(`../../../deepseek-harness`) because the workspace packages are not published to
the registry.

### 1. Build the Artifacts (the client bundle must already be built)

```sh
cd plugins/cost-balance
pnpm install          # Materialize link:-ed dependencies
node build.mjs        # Generate lib/index.js + lib/client.js (requires esbuild from the harness)
```

### 2. Install into the web Profile

```sh
# Run from the harness checkout to link this plugin into the web profile's node_modules
cd /Users/mori/src/deepseek-harness
pnpm dsh plugin --profile web add /Users/mori/src/dsh/plugins/cost-balance
```

### 3. Mount the Plugin

Append the following to `~/.dsh/profiles/web/cordis.patch.yml`:

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

Saving the file triggers a hot reload of the host half. Refresh the browser page;
the cost/balance status line will appear below the input box.

## Configuration

| Field | Default | Description |
|---|---|---|
| `pricing.inputPerM` | `2` | Price per million uncached input tokens (in `currency` units) |
| `pricing.outputPerM` | `8` | Price per million output tokens |
| `pricing.cacheReadPerM` | `0.5` | Price per million tokens read from cache on a cache hit |
| `pricing.cacheWritePerM` | `2` | Price per million tokens written to cache |
| `currency` | `¥` | Currency symbol used for pricing and display |
| `apiKeyEnv` | `DEEPSEEK_API_KEY` | Credential reference for the API key (environment variable name) |
| `baseURL` | `https://api.deepseek.com` | API endpoint base URL; `/user/balance` is appended to it |
| `refreshMs` | `60000` | Balance refresh interval in milliseconds |

Adjust the pricing table to match DeepSeek's current official rates. Configuration
changes take effect via hot reload as soon as the file is saved; no restart is
required.

## Verification

- **Balance**: `curl http://127.0.0.1:3080/cost-balance/balance` should return
  `{"balance":{"is_available":true,"balance_infos":[...]},"checkedAt":...,"lastError":null}`.
- **client bundle**: `curl http://127.0.0.1:3080/plugins/dsh-cost-balance/client.js` should return
  status 200 and `window.__ModuleLoader__.load({...})`.
- **Type checking**: `cd plugins/cost-balance && pnpm exec tsc --noEmit` (or the harness's tsc).

## Known Limitations

- **Changes to client source code require a restart**: The web profile disables
  module-level HMR. After modifying `src/client/*`, restart `dsh web` and refresh
  the page. The host half (`src/index.ts`, `src/projection.ts`) and edits to the
  `cordis.patch.yml` configuration support hot reload.
- **The cost is an estimate**: Rates are defined by the `pricing` configuration.
  The cost is calculated precisely from the token usage reported by the provider,
  but the rates themselves must be updated manually to match the official pricing;
  the result is not guaranteed to match the bill exactly.
- **The balance is read-only**: The plugin only retrieves and displays the balance;
  it does not support top-up or spending operations. If the balance endpoint fails,
  the last successful value is retained and the error is recorded in `lastError`.
- The plugin `name` in `cordis.patch.yml` must be the **package name**
  (`dsh-cost-balance`), because client modules scan `dsh.client` declarations by
  package name. After moving to another machine, run `dsh plugin add` again and
  verify that the profile dependency can be resolved.

## Next Steps

- [Tool development reference](https://deepseek-harness.github.io/docs/cookbook/adding-a-tool)
- [Packaging and installation](https://deepseek-harness.github.io/docs/user/develop/basic/publish)
- [Add a settings card](https://deepseek-harness.github.io/docs/cookbook/adding-a-settings-card) —
  make the pricing table editable from the Web settings page

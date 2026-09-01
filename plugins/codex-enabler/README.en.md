# codex-enabler

`codex-enabler` installs the official DeepSeek Harness Codex Provider Bundle and creates a separate agent preset that allows the model to use the `subagent_codex` tool. The Provider remains a Host capability; the generated preset grants the session access to that capability.

## Prerequisites

Before running the installer, make sure that:

- The Node.js and pnpm versions are compatible with the selected DeepSeek Harness checkout, and `pnpm` is available on `PATH`;
- The dependencies for that checkout have already been installed, and `pnpm dsh` runs successfully from within it;
- The current user has write access to `<dshHome>/profiles/<profile>` and `<dshHome>/.agent-presets`;
- Codex authentication has already been configured for the same operating-system user that will run Harness, with the same `HOME`/`CODEX_HOME` state.

If `DSH_HOME` is set and contains at least one non-whitespace character, its value is used as `<dshHome>`. If `DSH_HOME` is unset, empty, or contains only whitespace, the installer falls back to `~/.dsh`.

## Installation

From the `dsh` repository root, using the default sibling checkout at `../deepseek-harness`, run:

```sh
node plugins/codex-enabler/install.mjs web
```

The arguments are `[profile] [harness-checkout] [preset-id]`. Their defaults are, in order, `web`, the `deepseek-harness` checkout next to this repository, and `standard-codex`. For example, to specify all three arguments explicitly, run:

```sh
node plugins/codex-enabler/install.mjs web ../deepseek-harness my-codex
```

The installer:

1. Reads the registered Bundle package names from `<dshHome>/profiles/<profile>/package.json`;
2. Adds the official Bundle `@deepseek-ai/dsh-subagent-codex` if it is missing, then adds the companion Bundle `dsh-codex-enabler` if it is missing;
3. Copies the `standard` preset supplied with Harness to `<dshHome>/.agent-presets/<preset-id>`;
4. In the copied `agent.cordis.yml`, removes the single literal `disabled: true` from the unique `tool-subagent-codex` row; all other tool rows are copied unchanged;
5. Regardless of the value of `<preset-id>`, replaces `preset.yml` with the fixed display name `Standard + Codex` and description `Standard coding agent with the Codex subagent tool.`.

Bundle registration is add-if-missing only. The installer neither validates nor reorders Bundles that are already registered. The companion Bundle depends on the official Bundle being registered first because the former's `subagent-codex` loader row modifies the Provider row created by the latter. After installation, inspect `dsh.profile.bundles` in `<dshHome>/profiles/<profile>/package.json` and confirm that `@deepseek-ai/dsh-subagent-codex` appears before `dsh-codex-enabler`. The installer does not automatically correct previously registered Bundles that are in the reverse order.

The preset operation never overwrites an existing target directory. When the installer is run again, it considers the preset installed only if `<dshHome>/.agent-presets/<preset-id>/agent.cordis.yml` contains exactly one `tool-subagent-codex` row and that row does not contain the literal `disabled: true`. This check does not validate `preset.yml`, the directory's origin, or whether it is equivalent to the current `standard` preset supplied with Harness. Any existing target that fails the check causes installation to stop; structural validation errors reported by the composition parser may not include the target path.

After installation, restart the profile and select `<preset-id>` when creating a session. Existing sessions continue to use the preset and toolset with which they were started.

## Components

The names at each layer are intentionally different:

| Layer | Exact name | Responsibility |
|---|---|---|
| Official Bundle package | `@deepseek-ai/dsh-subagent-codex` | Registers the Host Provider row |
| Host loader row id | `subagent-codex` | The row modified by this companion Bundle |
| Provider registry name | `codex` | The Provider selected by the preset's tool row |
| Agent preset row id | `tool-subagent-codex` | Grants the delegation tool in the copied preset |
| Model-visible tool name | `subagent_codex` | The tool invoked by the DeepSeek model |

The invocation path is:

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

The executable comes from the fixed, package-local `@openai/codex` dependency (`0.149.1`) in the Provider package, not from a Codex executable on the machine's `PATH`. The machine supplies only the Codex authentication and native configuration state available in the current user's environment, including `HOME` and `CODEX_HOME`.

## Authentication and Permissions

The Provider does not sign in to Codex, create an account, trust a project, or rewrite native Codex settings. Configure authentication and all required native settings before starting Harness.

`permissionMode` controls the unattended approval and sandbox fields used by every Codex thread created by this Provider instance:

| Value | Behavior |
|---|---|
| `never` | At the field level, sets only `approvalPolicy: never` and omits the `sandbox` field, thereby using the native Codex default sandbox; the practical effect is a read-only workspace. Because approvals are never requested, file writes fail. |
| `approve-for-me` | Uses automatic approval review and a writable workspace sandbox (`approvalPolicy: on-request`, `approvalsReviewer: auto_review`, `sandbox: workspace-write`). |
| `dangerously-bypass-approvals-and-sandbox` | Disables approval and sandbox enforcement (`approvalPolicy: never`, `sandbox: danger-full-access`); use only when full Host access is genuinely required. |

Before the child process starts, variables with credential-like characteristics are removed from the parent process environment. If the child process requires an API key or another removed credential, pass it explicitly through the Provider's `env` configuration; do not assume that variables exported in the Harness process environment will be forwarded to Codex.

## Configuration

When the Bundle order is correct, this companion Bundle is applied after the official Provider Bundle and targets its existing `subagent-codex` loader row. It sets the Provider registry name to `codex` and the default `permissionMode` to `never`.

To override the Provider configuration, add a later entry to the profile's `cordis.patch.yml`:

```yaml
- id: subagent-codex
  config:
    providerName: codex
    permissionMode: approve-for-me
```

When `model` is omitted, native Codex model selection applies. Add the `model` field only if the selected Codex account supports that model; the Provider passes explicit values through unchanged and does not discover models, rewrite aliases, or select a fallback model.

Edits to the profile patch are reloaded live in the `web` profile. Changes to installed Bundle patches or package versions require a profile restart.

## Failures and Recovery

Installation is not transactional. Adding Bundles and generating the preset do not share a rollback mechanism: if either step fails, steps that completed successfully beforehand are retained. Before rerunning or repairing the installation, inspect the profile manifest and the preset target.

After a partial failure, correct the Bundle order first. A rerun adds only missing Bundles and accepts an existing preset only if it passes the narrowly defined composition check described above. If the preset target fails that check, inspect it first and preserve its contents as needed, then choose a different `<preset-id>`, or delete the target before rerunning.

For the Harness checkout, the installer checks only whether `pnpm-workspace.yaml` exists. It does not preflight build artifacts, the official Provider directory, or the `standard` preset directory supplied with Harness. Consequently, a successful installer exit does not guarantee that the first `subagent_codex` invocation will succeed: an unsupported platform, omitted optional dependencies, or a missing native Codex payload may surface only when the Provider starts for the first delegation.

## Uninstallation

With the default sibling-checkout layout, run the following from the `dsh` repository root:

```sh
cd ../deepseek-harness
pnpm dsh plugin --profile web remove dsh-codex-enabler
pnpm dsh plugin --profile web remove @deepseek-ai/dsh-subagent-codex
```

Removing these Bundles does not remove the preset generated by the installer. That preset is installer-generated user-root data, not user-authored data. After confirming that no new sessions need it, remove `<dshHome>/.agent-presets/<preset-id>` separately.

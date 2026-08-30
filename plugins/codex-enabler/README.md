# codex-enabler

`codex-enabler` installs the official DeepSeek Harness Codex Provider and
creates a separate agent preset that grants the model-facing
`subagent_codex` tool. The Provider remains a Host capability; only sessions
created with the generated preset receive the tool.

## Install

```sh
node /Users/mori/src/dsh/plugins/codex-enabler/install.mjs web
```

Arguments are `[profile] [harness-checkout] [preset-id]`. They default to
`web`, `../../../deepseek-harness` relative to this directory, and
`standard-codex`.

The installer:

1. adds the official `@deepseek-ai/dsh-subagent-codex` Profile Bundle;
2. adds this companion Bundle after it;
3. copies the shipped `standard` preset to
   `<dshHome>/.agent-presets/standard-codex`;
4. enables only `tool-subagent-codex` in the copy.

The official Provider package owns its compatible `@openai/codex` version and
native payload. This installer does not install a second Codex runtime version.
It resolves `<dshHome>` from `DSH_HOME` when set, otherwise from `~/.dsh`.

The installer never overwrites an existing preset. Re-running it leaves an
already enabled target unchanged; an incompatible existing target fails with
its path.

Restart the profile after installation, then select `standard-codex` when
creating a session. Existing sessions keep the preset and tool set they started
with.

## Composition

| Layer | Responsibility |
|---|---|
| Official `subagent-codex` Bundle | Registers the `codex` Provider once on the Host |
| This Bundle | Configures that existing Host row with `permissionMode: never` |
| `standard-codex` agent preset | Grants `subagent_codex` only to sessions using that preset |

The call path is:

```text
DeepSeek model
  -> subagent_codex tool in the selected agent preset
  -> codex Provider on the Host
  -> package-local @openai/codex app-server --stdio
  -> one ephemeral Codex thread
  -> final answer returned through the subagent result
```

Codex authentication and native settings come from the local Codex
installation. An explicit Provider `model` overrides the native model; when
omitted, Codex settings remain authoritative.

## Configuration

This Bundle applies after the official Provider Bundle and targets its
`subagent-codex` loader id. To override Provider configuration, add a later
entry to the profile's `cordis.patch.yml`:

```yaml
- id: subagent-codex
  config:
    providerName: codex
    permissionMode: approve-for-me
    model: gpt-5.6-sol
```

Profile patch edits reload live in the `web` profile. Changes to an installed
Bundle patch or package version require a profile restart.

## Uninstall

```sh
cd /Users/mori/src/deepseek-harness
pnpm dsh plugin --profile web remove dsh-codex-enabler
pnpm dsh plugin --profile web remove @deepseek-ai/dsh-subagent-codex
```

The generated preset is user-authored data and is intentionally retained.
Delete `<dshHome>/.agent-presets/standard-codex` separately after confirming
that no new session should use it.

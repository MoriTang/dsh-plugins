# greet-tool

An external (out-of-tree) plugin for
[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness): a configurable
`greet` tool that demonstrates the complete plugin development pattern:

- Cordis function plugin format (`name` / `inject` / `apply`)
- Schemastery `Config` schema (with defaults and validation at load time)
- Tool registration in `ctx.tools` via `defineTool`: typed parameters, standardized output, and Native `render`

The `@deepseek-ai/*` dependencies use `link:` to reference a local harness checkout
(`../../../deepseek-harness`). Because the workspace packages are not published to
the registry, linking a checkout is the officially supported way to develop external plugins.

## Loading into the Web UI

### Option A: Hot Loading (Recommended, No Restart Required)

Add the plugin entry to the user patch layer of the web profile
(`~/.dsh/profiles/web/cordis.patch.yml`):

```yaml
- insert:
    - id: greet-tool
      name: '/Users/mori/src/dsh/plugins/greet-tool/src/index.ts'
      config:
        greeting: 'Hello'
```

Save the file while `dsh web` is running. config-only HMR transactionally replays
the patch, so the plugin is **mounted immediately without a restart**.

### Option B: Load at Startup with a `--patch` overlay

Run the following from the harness checkout:

```sh
pnpm dsh web --patch /Users/mori/src/dsh/plugins/greet-tool/cordis.yml
```

Open `http://127.0.0.1:3080` and ask the model to invoke the `greet` tool:

> Use the greet tool to greet Ada.

The model receives the tool result `Hello, Ada!`.

## Configuring the Greeting

The plugin reads its configuration from `config` in `cordis.patch.yml` (or
`cordis.yml`):

```yaml
config:
  greeting: 'Hi there'
```

With Option A, configuration changes take effect through hot reload as soon as the
file is saved. With Option B, the `--patch` file is parsed only once at startup.

## Directory Structure

```
plugins/greet-tool/
├── package.json      # Private package; @deepseek-ai/* links to the harness checkout
├── tsconfig.json     # Editor type checking
├── cordis.yml        # --patch overlay: inserts the plugin entry
└── src/
    └── index.ts      # Plugin implementation: greet tool + Config schema
```

## Type Checking

```sh
cd /Users/mori/src/dsh/plugins/greet-tool
pnpm install          # Materialize the link:-ed @deepseek-ai/* node_modules
pnpm exec tsc --noEmit
```

## Known Limitations

- **Source changes require a restart**: the web profile disables module-level HMR.
  After modifying `src/index.ts`, restart `dsh web`; only changes to the
  `cordis.patch.yml` configuration layer are hot-reloaded.
- The plugin `name` must be an **absolute path** (the patch layer does not change
  the base directory used for module resolution).

## Next Steps

- [Tool development reference](https://deepseek-harness.github.io/docs/cookbook/adding-a-tool) —
  nested schemas, background tasks, policy hooks, and UI cards
- [Packaging and installation](https://deepseek-harness.github.io/docs/user/develop/basic/publish) —
  publish the plugin as an installable `dsh.bundle` package

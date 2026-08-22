# greet-tool

基于 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的
外部（out-of-tree）插件：一个可配置的 `greet` 工具，演示完整的插件编写范式 ——

- Cordis 函数插件形态（`name` / `inject` / `apply`）
- Schemastery `Config` schema（带默认值，加载时校验）
- 通过 `defineTool` 在 `ctx.tools` 注册工具：类型化参数、规范输出、Native `render`

`@deepseek-ai/*` 依赖通过 `link:` 指向本地 harness checkout
（`../../../deepseek-harness`）—— 工作区包不发布到 registry，链接 checkout
是官方支持的外部插件开发方式。

## 加载到 Web UI

### 方式 A：热加载（推荐，无需重启）

把插件行写入 web profile 的用户 patch 层
（`~/.dsh/profiles/web/cordis.patch.yml`）：

```yaml
- insert:
    - id: greet-tool
      name: '/Users/mori/src/dsh/plugins/greet-tool/src/index.ts'
      config:
        greeting: 'Hello'
```

`dsh web` 运行期间保存该文件，config-only HMR 会事务性重放 patch —— 插件
**立即挂载，无需重启**。

### 方式 B：启动时通过 `--patch` overlay 加载

从 harness checkout 运行：

```sh
pnpm dsh web --patch /Users/mori/src/dsh/plugins/greet-tool/cordis.yml
```

打开 `http://127.0.0.1:3080`，让模型调用 `greet` 工具：

> Use the greet tool to greet Ada.

模型收到工具结果 `Hello, Ada!`。

## 配置问候语

插件配置读取自 `cordis.patch.yml`（或 `cordis.yml`）中的 `config`：

```yaml
config:
  greeting: 'Hi there'
```

方式 A 下修改配置保存即热生效；方式 B 下 `--patch` 文件只在启动时解析一次。

## 目录结构

```
plugins/greet-tool/
├── package.json      # 私有包；@deepseek-ai/* 链接到 harness checkout
├── tsconfig.json     # 编辑器类型检查
├── cordis.yml        # --patch overlay：插入插件行
└── src/
    └── index.ts      # 插件本体：greet 工具 + Config schema
```

## 类型检查

```sh
cd /Users/mori/src/dsh/plugins/greet-tool
pnpm install          # 物化 link:-ed 的 @deepseek-ai/* node_modules
pnpm exec tsc --noEmit
```

## 已知限制

- **改源码需重启**：web profile 禁用了模块级 HMR，修改 `src/index.ts` 后需要
  重启 `dsh web`；只有 `cordis.patch.yml` 配置层编辑是热重载的。
- 插件 `name` 必须是**绝对路径**（patch 层不改变模块解析基准目录）。

## 下一步

- [工具编写参考](https://deepseek-harness.github.io/docs/cookbook/adding-a-tool) —
  嵌套 schema、后台任务、策略钩子、UI 卡片
- [打包与安装](https://deepseek-harness.github.io/docs/user/develop/basic/publish) —
  发布为可安装的 `dsh.bundle` 包

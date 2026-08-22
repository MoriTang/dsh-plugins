# dsh-plugins — DeepSeek Harness 外部插件仓库

本仓库存放基于 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
开发的**外部（out-of-tree）插件**。插件在 harness 官方仓库之外独立开发和维护，
通过配置层挂载进运行中的 dsh。

## 背景：为什么是"外部"插件

- DeepSeek Harness 的 `@deepseek-ai/*` 工作区包**不发布到 npm registry**，
  因此外部插件通过 `link:` 协议把依赖指向本机的 harness checkout。
- 本仓库默认假定 harness checkout 位于同级目录 `../deepseek-harness`
  （即 `/Users/mori/src/deepseek-harness`），各插件 `package.json` 中的
  `link:` 相对路径均基于该布局。

## 目录结构

```
dsh-plugins/
├── plugins/
│   └── greet-tool/        # 示例插件：可配置的 greet 工具（新插件的起点模板）
└── README.md
```

## 插件列表

| 插件 | 说明 | 状态 |
|---|---|---|
| `greet-tool` | 注册一个 `greet` 工具，通过 `Config` 配置问候语 | 可用 |

## 快速开始

### 1. 安装依赖

每个插件是独立的 pnpm 项目，`@deepseek-ai/*` 依赖通过 `link:` 指向 harness
checkout：

```sh
cd plugins/greet-tool
pnpm install
```

### 2. 加载插件（两种方式）

**方式 A：热加载（推荐，无需重启）**

把插件行写入 web profile 的用户 patch 层
（`~/.dsh/profiles/web/cordis.patch.yml`）：

```yaml
- insert:
    - id: greet-tool
      name: '/绝对路径/到/本仓库/plugins/greet-tool/src/index.ts'
      config:
        greeting: 'Hello'
```

`dsh web` 运行期间该文件被 config-only HMR 监听，**保存即生效**，插件立即
挂载，无需重启服务。修改 `config` 值同样实时生效；删除该行则卸载插件。

**方式 B：启动时通过 `--patch` overlay 加载**

```sh
cd /绝对路径/到/deepseek-harness
pnpm dsh web --patch /绝对路径/到/本仓库/plugins/greet-tool/cordis.yml
```

> **注意**：`--patch` overlay 只在启动时解析一次，运行中编辑它**不会**触发
> 热重载；热加载请使用方式 A 的 `cordis.patch.yml` 层。

### 3. 验证

在 Web UI（`http://127.0.0.1:3080`）让模型调用 `greet` 工具，例如：

> Use the greet tool to greet Ada.

模型应收到工具结果 `Hello, Ada!`。

## 开发新插件

1. 复制 `plugins/greet-tool` 作为起点模板。
2. 插件模块形态（`name` / `inject` / `apply`）、Schemastery `Config` schema、
   `ctx.tools` 注册均遵循官方教程：
   - [构建工具插件](https://deepseek-harness.github.io/docs/user/develop/basic/tool)
   - [插件配置](https://deepseek-harness.github.io/docs/user/develop/basic/config)
   - [工具编写参考](https://deepseek-harness.github.io/docs/cookbook/adding-a-tool)
3. 类型检查：

```sh
cd plugins/<your-plugin>
pnpm exec tsc --noEmit
```

## 已知限制

- **web 下修改插件源码不会热重载**：web profile 禁用了模块级 HMR（`hmr` 行
  `disabled: true`），改 `src/index.ts` 后需重启 `dsh web`；只有
  `cordis.patch.yml` 的配置层编辑是热重载的。
- **GUI 无法开关插件**：Web UI 的 Plugins 设置页只渲染已注册插件的配置卡片，
  没有运行时启用/停用操作。
- 插件 `name` 必须是**绝对路径**（patch 层不改变模块解析基准目录），换机器
  后需要相应调整。

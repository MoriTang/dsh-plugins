# dsh-neubrutalism-theme

DeepSeek Harness 的外部 Web 主题插件。它遵循 [Neubrutalism 指南](https://neubrutalism.com/)的视觉语法：2px 控件描边、3px 容器描边、方角、零模糊偏移阴影、有限的纯色强调面，以及按钮抬起/按下反馈。

## 视觉与字体

- 浅色基底采用 `#FFFDF5`，强调色使用 `#FFD23F`、`#FF6B6B`、`#74B9FF`、`#88D498`、`#FFA552` 和 `#B8A9FA`。
- 深色模式保留同一信息层级，改用深色表面、米白描边和高亮强调色。
- 展示标题：Syne Variable 800。
- 标题与控件：Space Grotesk Variable 700。
- 正文：Inter Variable；中文回退为 PingFang SC / Microsoft YaHei。
- 代码：Space Mono 400/700。

字体由 Fontsource 包安装。构建时只取 Latin WOFF2，并以内联 data URL 写入 `lib/client.js`，因此浏览器运行时不访问 Google Fonts，也不要求操作系统预装字体。

## 安装依赖、构建与测试

```sh
cd /Users/mori/src/dsh/plugins/neubrutalism-theme
pnpm install
pnpm run typecheck
pnpm test
pnpm run build
```

本仓库约定 Harness checkout 位于同级目录 `../deepseek-harness`；本地开发依赖通过 `link:` 指向该 checkout。

## 挂载到 web profile

插件同时是一个 bundle，可从 Harness checkout 注册：

```sh
cd /Users/mori/src/deepseek-harness
pnpm dsh plugin --profile web add /Users/mori/src/dsh/plugins/neubrutalism-theme
```

注册后重启 `pnpm dsh web`。bundle 的 `cordis.patch.yml` 会插入 `neubrutalism-theme` Loader 条目，package manifest 会把 `lib/client.js` 作为 Web client half 加载。

卸载时运行：

```sh
pnpm dsh plugin --profile web remove dsh-neubrutalism-theme
```

主题通过两个 Cordis effect 持有 token 覆盖和 `<style>` 元素。Loader 卸载插件时，两者都会被清理，基础 DSH 主题随即恢复。

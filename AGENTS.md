# AGENTS.md

## 项目简介

Firewood 是基于 Tauri 2 + React 19 + TypeScript 的本地优先桌面工具集，集成终端、文本/代码工具、记事本、图片导出、翻译等开发者常用工具。UI 使用 Ant Design，国际化使用 i18next，代码编辑器使用 Monaco。

## 开发命令

- 安装依赖：`npm install`
- 启动前端开发：`npm run dev`
- 启动桌面应用开发：`npm run tauri:dev`
- 构建桌面应用：`npm run tauri:build`

## 格式化与检查

- 格式化代码：`npx prettier --write .`（配置见 `.prettierrc.json`，CSS 文件使用 tab 缩进）
- Lint 检查：`npm run lint`
- 类型检查：`npx tsc --noEmit`

## 代码约定

### Monaco 编辑器

接入 Monaco 编辑器时必须优先使用 `src/hooks/useMonacoCompat.ts`。该 hook 已封装平台兼容性处理（字体栈、行高、IME 相关配置），notepad 与 json-formatter 两个工具均已接入，新增 Monaco 使用方应直接复用，不要在各工具内重复配置 `fontFamily`/`lineHeight`/`fontSize` 等选项。

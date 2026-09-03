# AGENTS.md

## 项目简介

Firewood 是基于 Tauri 2 + React 19 + TypeScript 的本地优先桌面工具集，集成终端、文本/代码工具、记事本、图片导出、翻译等开发者常用工具。UI 使用 Ant Design，国际化使用 i18next，编辑器统一使用 CodeMirror 6。

## 开发命令

- 安装依赖：`npm install`
- 启动前端开发：`npm run dev`
- 启动桌面应用开发：`npm run tauri:dev`
- 构建桌面应用：`npm run tauri:build`

## 格式化与检查

- 格式化代码：`npx prettier --write .`（配置见 `.prettierrc.json`，CSS 文件使用 tab 缩进）
- Lint 检查：`npm run lint`
- 类型检查：`npx tsc --noEmit`
- 前端单元测试：`npm test`（vitest，单次运行）/ `npm run test:watch`（监听模式）
- Rust 测试：`cargo test --manifest-path src-tauri/Cargo.toml`

## 代码约定

### CodeMirror 6 编辑器（唯一编辑器组件）

本项目所有文本编辑场景统一使用 CodeMirror 6。Monaco 已移除（WKWebView 下 IME 需大量 hack，且经 CDN 加载与本地优先定位冲突），不要再引入 `@monaco-editor/react` / `monaco-editor`。

接入时必须优先使用 `src/hooks/useCodemirror.ts`：

- `variant: 'writing'`（默认）：长文写作模式，比例字体栈，moxia 在用
- `variant: 'code'`：代码编辑模式，等宽字体栈 + 行号/折叠/括号匹配/补全 + 浅色代码主题；`language` 选项支持 json / html / javascript / plaintext 动态切换，notepad 与 json-formatter 在用

该 hook 已封装平台兼容与通用行为（字体栈、行高、IME 组合期防回环、字号 Compartment 动态重配、StrictMode 双挂载、受控值同步与 undo 历史隔离），新增使用方应直接复用，不要在各工具内重复配置 `fontFamily`/`lineHeight`/`fontSize`/IME 处理。监听文档/选区变化（如状态栏统计）用 `onUpdate`（自动继承 IME 延迟），需要 view 引用（如滚动重置）用 `onReady`。

编辑器右键菜单统一使用 `src/components/EditorContextMenu.tsx`（antd Dropdown 封装：剪切/复制/粘贴/全选/查找 + extraItems 扩展），不要在工具内自建。

CM6 平台注意事项（WKWebView）：

- `@codemirror/view` 版本下限 6.43.7：6.43.7–6.43.10 修复了 WebKit 下"滚动后首次点击 → 视口跳动/光标定位到错误行"（上游 #170/#1384/#1673 一族，涉及滚动锚定补偿与 posAtCoords 行内扫描），不要降级。
- code variant 禁用 `drawSelection()`：其光标/选区层依赖 getClientRects 测量，在 WKWebView 下画错位置；原生选区渲染（writing variant 同款）可靠，不要重新引入。
- WKWebView 的 focus/preventScroll shim 必须保留（`src/utils/wkWebViewFocusShim.ts`，在 `main.tsx` 启动时安装）：Safari 26 引擎忽略 `focus({preventScroll: true})` 并把旧光标滚回视口；CM 的 Safari-26 规避依赖 UA 里的 `Version/<n>`，而 Tauri WKWebView 的 UA 没有该 token（`safari_version` 解析为 0），CM 的规避在 Tauri 内必然失效。该 shim 包装 `HTMLElement.prototype.focus`，对 `preventScroll: true` 的调用做祖先滚动位置 save/restore（与 CM 内置 fallback 同款），修复"长文档滚到远处后点击 → 视口跳回旧光标行"的 bug。验证工具：json-formatter 内 dev-only 的 `JumpDebugger` 浮层（`import.meta.env.DEV` 下自动挂载）。

### Tauri Rust 命令

新增 Rust 侧命令遵循现有 `pty.rs`（有状态资源池）与 `translate.rs`（无状态调用）两种范例。有状态资源用 `Arc<Manager>` + `parking_lot::Mutex` 封装（不要用 `std::sync::Mutex`），在 `main.rs` 的 `Builder::default().manage(...)` 注入 State，命令签名用 `State<'_, Arc<YourManager>>` 取出。所有命令返回 `Result<T, String>`，错误用 `.map_err(|e| format!("...: {}", e))?` 传递。退出清理在 `RunEvent::ExitRequested` 回调里调 `close_all()`。

### SQLite 集成（rusqlite）

moxia 工具使用 `rusqlite`（`bundled` feature）在 Rust 侧管理 SQLite，每本书一个 `.moxia` 文件。连接池由 `MoxiaManager` 管理（`Mutex<HashMap<PathBuf, Connection>>`），不依赖 `tauri-plugin-sql`。Rust 侧的 `Connection::open` 不受 `capabilities` 的 fs scope 约束，可读写任意用户有 OS 权限的路径。Migration 从一开始就内置（`src-tauri/src/moxia/migration.rs`），新增表结构时按版本号追加 migration。

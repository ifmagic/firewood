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
- 前端单元测试：`npm test`（vitest，单次运行）/ `npm run test:watch`（监听模式）
- Rust 测试：`cargo test --manifest-path src-tauri/Cargo.toml`

## 代码约定

### Monaco 编辑器

接入 Monaco 编辑器时必须优先使用 `src/hooks/useMonacoCompat.ts`。该 hook 已封装平台兼容性处理（字体栈、行高、IME 相关配置），notepad 与 json-formatter 两个工具均已接入，新增 Monaco 使用方应直接复用，不要在各工具内重复配置 `fontFamily`/`lineHeight`/`fontSize` 等选项。

### CodeMirror 6 编辑器

接入 CodeMirror 6 编辑器时必须优先使用 `src/hooks/useCodemirror.ts`。该 hook 已封装平台兼容性处理（写作字体栈、行高、IME 组合期防回环、字号 Compartment 动态重配、StrictMode 双挂载、切内容防 undo 串），moxia 工具已接入，新增 CodeMirror 使用方应直接复用，不要在各工具内重复配置 `fontFamily`/`lineHeight`/`fontSize`/IME 处理。

### Tauri Rust 命令

新增 Rust 侧命令遵循现有 `pty.rs`（有状态资源池）与 `translate.rs`（无状态调用）两种范例。有状态资源用 `Arc<Manager>` + `parking_lot::Mutex` 封装（不要用 `std::sync::Mutex`），在 `main.rs` 的 `Builder::default().manage(...)` 注入 State，命令签名用 `State<'_, Arc<YourManager>>` 取出。所有命令返回 `Result<T, String>`，错误用 `.map_err(|e| format!("...: {}", e))?` 传递。退出清理在 `RunEvent::ExitRequested` 回调里调 `close_all()`。

### SQLite 集成（rusqlite）

moxia 工具使用 `rusqlite`（`bundled` feature）在 Rust 侧管理 SQLite，每本书一个 `.moxia` 文件。连接池由 `MoxiaManager` 管理（`Mutex<HashMap<PathBuf, Connection>>`），不依赖 `tauri-plugin-sql`。Rust 侧的 `Connection::open` 不受 `capabilities` 的 fs scope 约束，可读写任意用户有 OS 权限的路径。Migration 从一开始就内置（`src-tauri/src/moxia/migration.rs`），新增表结构时按版本号追加 migration。

# AGENTS.md

## Project Overview

Firewood is a local-first desktop toolbox built on Tauri 2 + React 19 + TypeScript, bundling developer tools: terminal, text/code tools, notepad, image export, translation, and more. UI uses Ant Design; i18n uses i18next.

## Common Commands

- Install dependencies: `npm install`
- Develop: `npm run dev` (frontend) / `npm run tauri:dev` (desktop app)
- Build: `npm run tauri:build`
- Format: `npx prettier --write .` (config in `.prettierrc.json`; CSS uses tab indentation)
- Lint: `npm run lint`
- Type check: `npx tsc -b` (the root tsconfig is a `files: []` reference shell — plain `tsc --noEmit` checks nothing and passes vacuously)
- Frontend tests: `npm test` (single run) / `npm run test:watch` (watch mode), vitest
- Rust tests: `cargo test --manifest-path src-tauri/Cargo.toml`

## Conventions

### Editor (CodeMirror 6)

All text editing scenarios use CodeMirror 6. Monaco is banned (`@monaco-editor/react` / `monaco-editor`) — poor IME compatibility under WKWebView, and CDN loading conflicts with the local-first positioning.

Always reuse `src/hooks/useCodemirror.ts`:

- `variant: 'writing'` (default): long-form writing mode, proportional font stack (used by moxia)
- `variant: 'code'`: code editing mode, monospace font stack + line numbers/folding/bracket matching/completion + light theme; `language` supports dynamic switching between json / html / javascript / plaintext (used by notepad and json-formatter)

Font stacks, line height, IME composition loop prevention, dynamic font-size Compartment reconfiguration, StrictMode double-mount handling, controlled-value sync, and undo history isolation are all encapsulated in the hook — do not reconfigure them in tools. Use `onUpdate` to observe document/selection changes (e.g. status bar stats; inherits IME delay automatically); use `onReady` when you need the view reference (e.g. scroll reset).

Context menus must use `src/components/EditorContextMenu.tsx` (antd Dropdown: cut/copy/paste/select all/find + `extraItems` extension) — do not build your own.

WKWebView (Tauri's webview) hard constraints:

- `@codemirror/view` minimum version 6.43.7, do not downgrade: the WebKit "scroll, then click → viewport jump / caret lands on wrong line" issue was only fully fixed across 6.43.7–6.43.10 (upstream #170/#1384/#1673 family).
- code variant does not use `drawSelection()`: its selection layer relies on getClientRects measurement, which renders wrong under WKWebView; native selection rendering (same as the writing variant) is reliable.
- `src/utils/wkWebViewFocusShim.ts` must be kept, installed at startup in `main.tsx`: the Safari 26 engine ignores `focus({preventScroll: true})` and scrolls the old caret back into view; CM's built-in Safari-26 workaround depends on the `Version/<n>` token in the UA, which Tauri WKWebView's UA lacks, so it always fails. The shim wraps `focus` to save/restore ancestor scroll positions on `preventScroll: true` calls — removing it reintroduces "long document scrolled far, click → viewport jumps back to the old caret line". Dev verification: the `JumpDebugger` overlay in json-formatter (auto-mounted under `import.meta.env.DEV`).

### Tauri Rust Commands

New commands follow the two existing patterns: `pty.rs` (stateful resource pool) and `translate.rs` (stateless call):

- Stateful resources: wrap in `Arc<Manager>` + `parking_lot::Mutex` (not `std::sync::Mutex`), inject state via `Builder::default().manage(...)` in `main.rs`, retrieve with `State<'_, Arc<YourManager>>` in command signatures.
- All commands return `Result<T, String>`; propagate errors with `.map_err(|e| format!("...: {}", e))?`.
- Exit cleanup: call `close_all()` in the `RunEvent::ExitRequested` callback.

### SQLite (rusqlite)

moxia uses `rusqlite` (with the `bundled` feature) to manage SQLite on the Rust side, one `.moxia` file per book:

- The connection pool is managed by `MoxiaManager` (`Mutex<HashMap<PathBuf, Connection>>`); `tauri-plugin-sql` is not used.
- Rust-side `Connection::open` is not constrained by `capabilities` fs scopes — it can read/write any path the user has OS permission for.
- Migrations are built into `src-tauri/src/moxia/migration.rs`; append new table schemas as versioned migrations.

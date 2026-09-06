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

### Terminal (xterm.js)

- Forced repaints go through `forceTerminalRedraw` in `src/tools/terminal/index.tsx`: in @xterm/xterm 6.0.0 a same-size `Terminal.resize()` is a no-op (`CoreBrowserTerminal` early-returns) and a same-size `TIOCSWINSZ` delivers no SIGWINCH, so it round-trips the width (`resize(cols+1, rows)`, then back). Both resizes take the full renderer path (row rebuild + dimension recompute) and notify the PTY, so TUI apps redraw exactly as they do on a window resize; the buffer reflow round-trips losslessly. **The two resizes must not run in the same JS task**: the browser only runs style/layout/paint once per task, so a same-frame round-trip is a net-zero layout change and WKWebView keeps its stale composited output — the ghosting survives, making the refresh button look dead. `forceTerminalRedraw` therefore grows one column synchronously and restores it on the **second** `requestAnimationFrame` (a single rAF is not enough — rAF callbacks run before that frame's style/layout, so the intermediate state would never be painted). The one-frame-wide intermediate column is clipped by the container's `overflow: hidden`. Re-entrant requests while a round-trip is pending are ignored (`redrawPending`), and the restore leg aborts if an external resize (fit on container/font change) has taken over the intermediate size. The header refresh button, the `devicePixelRatio`-change fallback, and the remount DPR check all go through `refreshTerminalDisplay` (fit + `forceTerminalRedraw`). The app-level DPR watch exists because xterm's built-in `ScreenDprMonitor` never notifies the PTY.
- Intrinsic xterm behaviors the round-trip relies on (onResize firing per real size change, `renderRows` doing full `replaceChildren` row rebuilds, same-size resize being a no-op) are pinned by `src/tools/terminal/real-xterm.test.ts`, which exercises the real `@xterm/xterm` package instead of the page-level mock.
- PTY resize notification lives solely in each tab's `onResize` handler; `fit()` never invokes `resize_pty` itself.
- Never call `fit()` on a hidden/unmounted tab: its measurements are garbage (`display: none` plus the inline `height: 100%` host parses as ~100px) and can shrink the PTY to a few rows.

### Window Titlebar & Always-on-Top Pin

- macOS uses `titleBarStyle: "Overlay"` via `src-tauri/tauri.macos.conf.json` (platform configs merge with RFC 7386 JSON merge patch — **arrays are replaced whole**, so that file duplicates the full window config plus the style). The webview extends under the transparent titlebar; native traffic lights stay top-left.
- `npm run tauri:dev` runs `tauri dev --config src-tauri/tauri.dev.conf.json`, and `--config` merges **last** (over base + platform config, via `TAURI_CONFIG` in tauri-codegen). Because its `app.windows` array also replaces the array whole, `tauri.dev.conf.json` must duplicate the full window config (including `titleBarStyle` and `dragDropEnabled`) or dev silently loses those settings — this is exactly why Overlay once appeared "not to take effect" despite full restarts. Sync rule: any window-config field present in one config must stay identical across every config file that carries it; cross-platform fields live in all three (`tauri.conf.json`, `tauri.macos.conf.json`, `tauri.dev.conf.json`), platform-specific additions (e.g. `titleBarStyle`) go in the platform file and the dev file only. `src/tauri-config-sync.test.ts` is the executable guard. Trade-off note: the dev config's window array exists solely to title the dev window "Firewood Dev" while keeping Overlay parity — dropping that title override would let base+platform config flow through and eliminate the dev duplication entirely (cost: the dev window would be titled "Firewood").
- `src/App.tsx` mounts `<TitleBar />` above the sidebar/content `Layout` inside `.app-shell` (see `src/App.css`). **The shell needs `width: 100%`**: `#root` is a ROW flex container, and `antd`'s `.ant-layout-content { width: 0; flex: auto }` collapses the tool pane to width 0 (white screen) if the shell is allowed to size to its content instead of filling the row. The shell also uses `overflow: hidden` so the taller-than-row sidebar (see below) can't page-scroll.
- `src/components/TitleBar` renders the 28px top strip (macOS only): it is the `data-tauri-drag-region` drag surface and hosts the global always-on-top pin button at the far right. It must NOT render its own app title: `titleBarStyle: "Overlay"` only sets `titlebarAppearsTransparent` + `FullSizeContentView` (see tauri-runtime-wry) — the native window title still shows next to the traffic lights, so a web-side title would duplicate it. The platform guard lives in a wrapper component so no hooks/window-API calls run off macOS.
- The pin itself is the shared `PinToggle` component (`src/components/PinToggle`): `variant="titleBar"` + `placement="left"` in the TitleBar strip, `variant="sidebar"` + `placement="right"` in the sidebar footer on Windows/Linux. **Exactly one instance may mount per platform** (two would fight over one window state) — the XOR invariant is pinned by `src/components/Sidebar/Sidebar.test.tsx`. Platform gating uses `isMacPlatform()` (`src/utils/platform.ts`, sync UA sniff so it can gate the render tree); the window mutation is guarded separately by the runtime check in `useAlwaysOnTop`.
- Sidebar height is `100%` (not `100vh`): inside `.app-shell` the content row is `100vh − titlebar`, so a hard `100vh` would overflow the row by the titlebar height. On Windows/Linux the native title bar remains and the pin surfaces in the sidebar footer (via the shared `PinToggle`).
- Pin state is persistent (`useAlwaysOnTop` → localStorage `firewood-always-on-top`, type-guarded via `usePersistentState`'s validator) and re-applied on launch. The required permissions `core:window:allow-set-always-on-top` and `core:window:allow-start-dragging` are in `src-tauri/capabilities/default.json` — neither is in `core:window:default`. The sync-throw failure mode of `getCurrentWindow()` outside Tauri is pinned by `src/hooks/real-tauri-window.test.ts`.
- The titlebar pin's Tooltip must use `placement="left"`. Default `top` centers the popup on a button 12px from the right edge; during rc-trigger's measure/align phase the popup momentarily overflows the viewport, the document becomes scrollable, and WKWebView flashes its scroll indicators — perceived as the whole window shaking right+bottom, lasting until rc-trigger re-aligns, recurring on every hover. As of this writing the pin is the only button whose default top popup overflows (other default-placement tooltips — json-formatter, translate, numbox — sit away from viewport edges); debug probes with short popups will NOT reproduce this. Any future element pinned against a viewport edge with a centered popup needs the same treatment.

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

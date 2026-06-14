# Firewood — Design Document

## 1. Overview

**Firewood** is a local-first desktop utility suite for common developer workflows.

- **Desktop-native**: built with Tauri and system WebView, with Rust for native capabilities
- **Modular**: each tool is registered through a shared `ToolMeta` contract
- **Stateful**: tool state, ordering, visibility, and preferences are persisted locally
- **Practical**: combines terminal, text/code utilities, note taking, image export, and translation

## 2. Implemented Tools

| Tool | Current implementation |
|------|------------------------|
| Terminal | Multi-tab local shell with Rust PTY backend, shell selection, system font selection, font size control, buffered output, and session continuity across navigation |
| JSON Formatter | Monaco-based editor with format, minify, unescape, JSONC-aware formatting, copy/clear actions, and persisted content |
| Timestamp | Unix timestamp/date conversion, seconds/milliseconds toggle, quick current time/date actions, copy support, and persisted history |
| Diffchecker | GitHub-style unified review diff with line numbers, inline word highlights, collapsed unchanged sections, expand-all controls, and persisted inputs |
| Notepad | Multi-tab local notes and file editing with Monaco, local open/save, JSON formatting, and persisted tab state |
| Base64 Codec | Encode/decode workflow with mode switch, swap action, and persisted input/output |
| URL Codec | Encode/decode workflow with live conversion and persisted input/output |
| Hash | Text and file hashing for MD5 / SHA-1 / SHA-256, including drag-and-drop file support |
| Image to PDF | Multi-image A4 export with 1-4 images per page, layout presets, drag reorder, preview paging, optional size limit, and save dialog integration |
| Translate | Tencent Cloud / Baidu translation with Rust-side signing, 13 language pairs, provider settings, history, and adjustable reading size |

## 3. Tech Stack

### 3.1 Core

| Layer | Technology |
|-------|------------|
| Desktop runtime | Tauri 2 |
| Frontend | React 19 + TypeScript 5 |
| Build tool | Vite 8 |
| Routing | React Router DOM 7 |

### 3.2 UI and shared libraries

| Library | Purpose |
|---------|---------|
| Ant Design 6 | Main UI components |
| CSS Modules | Component-scoped styling |
| `@monaco-editor/react` | Code and note editing |
| `@xterm/xterm` + addons | Terminal rendering, fit, links, Unicode 11 |
| `diff` | Text diffing |
| `js-base64` | Base64 conversion |
| `dayjs` | Time handling |
| `spark-md5` / `js-sha1` / `js-sha256` | Hashing |
| `jspdf` | PDF generation |
| `react-markdown` | Release note rendering |
| `i18next` + `react-i18next` | Internationalization |

### 3.3 Rust-side dependencies

| Crate / plugin | Purpose |
|----------------|---------|
| `reqwest` | Translation API requests |
| `hmac` + `sha2` | Tencent Cloud request signing |
| `md-5` | Baidu request signing |
| `font-kit` | System font discovery |
| `libc` | PTY and process integration |
| `parking_lot` | PTY manager synchronization |
| `tauri-plugin-updater` | App updates |
| `tauri-plugin-single-instance` | Single-instance behavior in release builds |
| `tauri-plugin-dialog`, `fs`, `opener`, `process`, `shell` | Native file/system integrations |

## 4. Architecture

### 4.1 Frontend shell

- `src/App.tsx` wires the theme, router, sidebar, updater, and about dialog
- `src/components/Sidebar/` owns navigation, visibility toggles, and drag reorder
- `src/components/SettingsMenuButton/` exposes language switching, update checks, and About entry
- `src/components/ToolLayout/`, `StatusBar/`, and `FontSizeControl/` provide shared tool chrome

### 4.2 Tool registry and shared state

- `src/router/tools.tsx` is the single source of truth for tool registration
- `src/types/tool.ts` defines the `ToolMeta` contract used by every tool
- Shared hooks:
  - `usePersistentState` for localStorage-backed state
  - `useToolOrder` for persisted tool ordering
  - `useToolVisibility` for sidebar visibility
  - `useResizablePanels` for split-pane tools
  - `useEditorFontSize` for shared editor font controls

### 4.3 Native bridge

- `src-tauri/src/main.rs` registers commands, tray behavior, updater integration, and macOS menu wiring
- `src-tauri/src/pty.rs` manages terminal session lifecycle, IO, and resizing
- `src-tauri/src/translate.rs` signs and sends Tencent Cloud / Baidu translation requests

### 4.4 Release-note flow

- `src/components/Updater/` checks for updates, renders changelog snippets, downloads installs, and restarts
- `src/utils/updateNotes.ts` extracts changelog content from release bodies and caches update notes locally
- `src/components/AboutDialog/` reads the bundled `.github/workflows/build.yml` release body to show local release notes for the current version

## 5. Project Structure

```text
firewood/
├── .github/
│   └── workflows/
│       └── build.yml
├── src-tauri/
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── src/
│       ├── main.rs
│       ├── pty.rs
│       └── translate.rs
├── src/
│   ├── App.tsx
│   ├── main.tsx
│   ├── assets/
│   ├── components/
│   │   ├── AboutDialog/
│   │   ├── FontSizeControl/
│   │   ├── SettingsMenuButton/
│   │   ├── Sidebar/
│   │   ├── StatusBar/
│   │   ├── ToolLayout/
│   │   └── Updater/
│   ├── hooks/
│   │   ├── useEditorFontSize.ts
│   │   ├── usePersistentState.ts
│   │   ├── useResizablePanels.ts
│   │   ├── useToolOrder.ts
│   │   └── useToolVisibility.ts
│   ├── i18n/
│   │   ├── index.ts
│   │   └── locales/
│   ├── router/
│   │   └── tools.tsx
│   ├── tools/
│   │   ├── base64-codec/
│   │   ├── hash/
│   │   ├── img-to-pdf/
│   │   ├── json-formatter/
│   │   ├── notepad/
│   │   ├── terminal/
│   │   ├── text-diff/
│   │   ├── timestamp/
│   │   ├── translate/
│   │   └── url-codec/
│   ├── types/
│   │   └── tool.ts
│   ├── utils/
│   │   └── updateNotes.ts
│   └── jsonc-parser.d.ts
├── DESIGN.md
├── README.md
└── README.zh-CN.md
```

## 6. Extension Model

Each tool is registered through `ToolMeta`:

```ts
export interface ToolMeta {
  id: string;
  name: string;
  icon: ReactNode;
  description: string;
  component: LazyExoticComponent<FC>;
  visible?: boolean;
}
```

To add a new tool:

1. Create `src/tools/<tool-id>/index.tsx` and export the tool component
2. Register the tool in `src/router/tools.tsx`
3. Add i18n labels if the tool needs localized names or text

## 7. Runtime Features

### Sidebar customization

Users can reorder tools and toggle visibility from the sidebar menu. Both order and visibility are persisted locally.

### Persistence

Most tools store working state locally, including note tabs, translation settings, editor font sizes, diff inputs, timestamp history, and cached update notes.

### Updates

The updater checks once shortly after launch and then every 5 hours. Manual checks are available from both the tray menu and the in-app settings menu.

### About and release notes

The About dialog opens from the sidebar settings menu, shows the app version, links to the GitHub repository, and displays bundled release notes for the current build.

### Tray and window lifecycle

The app provides a tray icon with show, update, and quit actions. Closing the window hides the app instead of quitting.

### Language support

English and Simplified Chinese are built in. The initial language is auto-detected, and users can switch languages from the settings menu.

### Single-instance release behavior

In non-debug builds, re-launching the app focuses the existing window instead of opening a second instance.

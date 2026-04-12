# Firewood — Design Document

## 1. Overview

**Firewood** is a cross-platform desktop toolbox for developers, integrating commonly used development utilities to streamline everyday workflows.

- **Cross-platform**: Supports macOS, Windows, and Linux
- **Lightweight**: Built on Tauri, leveraging the system's native WebView — no embedded Chromium, resulting in a small installer size
- **Extensible**: Tool modules register through a unified interface; adding new tools requires no changes to core code

Current version: **[latest](https://github.com/ifmagic/firewood/releases)**

---

## 2. Implemented Tools

| Tool | Description |
|------|-------------|
| JSON Formatter | Format, minify, unescape & validate with Monaco Editor syntax highlighting; collapsible original input panel; auto-collapses after formatting |
| Timestamp | Unix timestamp ↔ human-readable date conversion with seconds/milliseconds toggle and one-click copy; conversion history (up to 50 records, only recorded on manual conversion, persisted to localStorage, copyable details & clearable) |
| Text Diff | Side-by-side line-by-line diff with resizable panels |
| Notepad | Multi-tab editing with create (random default name), rename, and close (with confirmation); content persisted to localStorage; Monaco Editor (light theme, line numbers, code folding); built-in right-click JSON formatting (fault-tolerant parsing); bottom status bar showing current line char count and selected char count; Cmd/Ctrl+Click to open links; mouse wheel font resizing |
| Base64 Codec | Base64 encode & decode |
| URL Codec | URL encode & decode |
| Hash | MD5 / SHA-1 / SHA-256 for text input and file drag-and-drop (Web Crypto API + SparkMD5) |
| Image to PDF | Merge multiple images into A4 PDF; supports 1–4 images per page with vertical/horizontal layout; thumbnail drag-and-drop reorder; live preview; native file save dialog via Tauri |
| Translate | Tencent Cloud / Baidu translation API, 13 languages; Rust backend API signing (TC3-HMAC-SHA256 / MD5); API key configuration panel; source/translation dual panel; mouse wheel font resizing; translation history (up to 50 records, only recorded on manual translation, persisted to localStorage, copyable details & clearable) |

---

## 3. Tech Stack

### 3.1 Core Framework

| Layer | Technology | Version |
|-------|-----------|---------|
| Desktop framework | [Tauri](https://tauri.app) | 2.x |
| Frontend framework | React | 19.x |
| Language | TypeScript | 5.x |
| Build tool | Vite | 8.x |
| Routing | React Router DOM | 7.x |

### 3.2 UI & Styling

| Library | Purpose |
|---------|---------|
| Ant Design 6.x | Primary UI component library (layout, menus, forms, notifications, etc.) |
| @ant-design/icons | Icons |
| CSS Modules | Component-level style isolation |

### 3.3 Feature Libraries

| Library | Purpose |
|---------|---------|
| `@monaco-editor/react` | Code editor (JSON Formatter, Notepad) |
| `diff` | Text diff algorithm |
| `js-base64` | Base64 encode/decode |
| `dayjs` | Timestamp formatting |
| `spark-md5` | MD5 computation |
| `js-sha1` / `js-sha256` | SHA-1 / SHA-256 computation |
| `jspdf` | Client-side PDF generation (Image to PDF) |
| `react-markdown` | Release notes Markdown rendering |
| `i18next` + `react-i18next` | Internationalization (English & Chinese) |

### 3.4 Rust Dependencies (src-tauri)

| Crate | Purpose |
|-------|---------|
| `reqwest` 0.11 | HTTP client (translation API calls) |
| `hmac` + `sha2` | TC3-HMAC-SHA256 signing (Tencent Cloud API) |
| `md-5` | MD5 signing (Baidu Translation API) |
| `hex` | Hexadecimal encoding |
| `chrono` | Timestamp generation |
| `rand` | Random number generation (Baidu salt) |
| `serde` + `serde_json` | JSON serialization |
| `tauri-plugin-single-instance` | Single-instance enforcement (window reuse) |

### 3.5 Engineering Standards

| Tool | Purpose |
|------|---------|
| ESLint + Prettier | Code style consistency |

---

## 4. Project Structure

```
firewood/
├── src-tauri/                  # Tauri/Rust backend
│   ├── src/
│   │   ├── main.rs             # Main process entry (menu, system tray, events)
│   │   └── translate.rs        # Translation API calls (Tencent Cloud / Baidu)
│   ├── Cargo.toml
│   └── tauri.conf.json         # App config (window, update source, permissions)
├── src/                        # React frontend
│   ├── main.tsx                # App entry point
│   ├── App.tsx                 # Root component (routing, layout)
│   ├── i18n/
│   │   ├── index.ts            # i18n initialization (language detection, persistence)
│   │   └── locales/
│   │       ├── en.ts           # English translations
│   │       └── zh-CN.ts        # Simplified Chinese translations
│   ├── router/
│   │   └── tools.tsx           # Tool registry (ToolMeta list)
│   ├── types/
│   │   └── tool.ts             # ToolMeta interface definition
│   ├── tools/                  # Tool module directory
│   │   ├── json-formatter/
│   │   ├── timestamp/
│   │   ├── text-diff/
│   │   ├── notepad/
│   │   ├── base64-codec/
│   │   ├── url-codec/
│   │   ├── hash/
│   │   ├── img-to-pdf/
│   │   └── translate/
│   ├── components/
│   │   ├── Sidebar/            # Left navigation bar (drag-and-drop reorder)
│   │   ├── ToolLayout/         # Unified tool layout container
│   │   ├── TitleBar/           # Title bar component
│   │   ├── FontSizeControl/    # Editor font size control
│   │   ├── AboutDialog/        # About dialog (triggered by macOS menu event)
│   │   ├── SettingsDialog/     # Settings dialog (language switcher)
│   │   └── Updater/            # Auto-updater (progress bar + Markdown release notes)
│   ├── hooks/
│   │   ├── usePersistentState.ts   # localStorage state persistence
│   │   ├── useResizablePanels.ts   # Dual-pane resize logic
│   │   ├── useEditorFontSize.ts    # Editor font size state
│   │   ├── useToolVisibility.ts    # Tool show/hide management
│   │   └── useToolOrder.ts         # Tool drag-and-drop order persistence
│   └── styles/                 # Global styles
├── public/
├── DESIGN.md
├── README.md
├── README.zh-CN.md
├── package.json
└── vite.config.ts
```

---

## 5. Tool Module Extension

Each tool module registers via the `ToolMeta` interface. Once registered, it automatically appears in the sidebar and participates in routing:

```typescript
// src/types/tool.ts
export interface ToolMeta {
  id: string;                                   // Unique ID, also used as route path
  name: string;                                 // Sidebar display name
  icon: ReactNode;                              // Sidebar icon
  description: string;                          // Brief description
  component: LazyExoticComponent<FC>;           // Lazy-loaded tool component
}
```

Steps to add a new tool:
1. Create a directory under `src/tools/<tool-id>/` and implement the tool component (default export)
2. Add the corresponding `ToolMeta` entry in `src/router/tools.tsx`

---

## 6. App-Level Features

### Auto Update

Implemented via Tauri updater. The update source points to `latest.json` in GitHub Releases. Checks automatically 3 seconds after launch, then every 5 hours. When a new version is detected, the `Updater` component displays an update prompt using Ant Design `notification`, including version number, Markdown-rendered release notes, and a download progress bar. Prompts user to restart after download completes. Both the macOS native menu and system tray support a "Check for Updates" menu item.

### About Dialog

The `AboutDialog` component listens for the `app://about-firewood` custom event (triggered by the Rust-side macOS native menu item) and displays a modal with version number and tech stack info. Clicking the version number reveals current version release notes, parsed from the local `build.yml` file (inlined at build time via Vite `?raw`), requiring no network request.

### State Persistence

The `usePersistentState` hook wraps `localStorage` for scenarios that need cross-session state retention: notepad tab lists, editor font sizes, translation tool configuration, etc.

### Single Instance

Implemented via the `tauri-plugin-single-instance` plugin. Launching the app again won't open a new window — it automatically focuses the existing one.

### System Tray

Supports show window, check for updates, and quit menu actions. Closing the window doesn't quit the app — it continues running in the tray.

### Sidebar Drag-and-Drop Reorder

The `useToolOrder` hook manages tool list ordering via the HTML5 native Drag & Drop API, with order persisted to `localStorage`. Newly added tools are automatically appended to the end of the list.

### Internationalization (i18n)

Implemented via `i18next` + `react-i18next`. Supports English and Simplified Chinese. Language is auto-detected from the browser's `navigator.language` on first launch, with manual switching available in the Settings dialog. The selected language is persisted to `localStorage`.

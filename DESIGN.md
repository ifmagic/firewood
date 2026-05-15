# Firewood — Design Document

## 1. Overview

**Firewood** is a cross-platform desktop toolbox for developers.

- **Cross-platform**: macOS, Windows, Linux
- **Lightweight**: Tauri + system WebView, no embedded Chromium
- **Extensible**: Tool modules register via unified interface, no core changes needed

---

## 2. Implemented Tools

| Tool | Description |
|------|-------------|
| Terminal | Embedded local shell (PTY), persistent sessions across tool switches, custom font selection (system fonts), Unicode 11 support, font size control, shell selection (zsh/bash/sh/fish), login shell mode (sources ~/.zprofile), auto-focus on switch |
| JSON Formatter | Format, minify, unescape & validate with Monaco Editor; collapsible original input |
| Timestamp | Unix timestamp ↔ date conversion, seconds/milliseconds toggle, history (50 records, persisted) |
| Text Diff | Side-by-side line-by-line diff, resizable panels |
| Notepad | Multi-tab editing, localStorage persistence, Monaco Editor (light theme, line numbers, folding), right-click JSON formatting, char count status bar, mouse wheel font resize |
| Base64 Codec | Base64 encode & decode |
| URL Codec | URL encode & decode |
| Hash | MD5 / SHA-1 / SHA-256 for text and file drag-and-drop |
| Image to PDF | Multi-image layout (1–4 per page), vertical/horizontal arrangement, thumbnail reorder, live preview, A4 PDF export |
| Translate | Tencent Cloud / Baidu API, 13 languages, Rust backend signing, API key config panel, history (50 records, persisted) |

---

## 3. Tech Stack

### 3.1 Core Framework

| Layer | Technology | Version |
|-------|-----------|---------|
| Desktop | Tauri | 2.x |
| Frontend | React | 19.x |
| Language | TypeScript | 5.x |
| Build | Vite | 8.x |
| Routing | React Router DOM | 7.x |

### 3.2 UI & Styling

| Library | Purpose |
|---------|---------|
| Ant Design 6.x | Primary UI components |
| @ant-design/icons | Icons |
| CSS Modules | Component style isolation |

### 3.3 Feature Libraries

| Library | Purpose |
|---------|---------|
| `@monaco-editor/react` | Code editor |
| `@xterm/xterm` | Terminal emulator |
| `@xterm/addon-fit` | Terminal auto-resize |
| `@xterm/addon-web-links` | Clickable links in terminal |
| `@xterm/addon-unicode11` | Unicode 11 character width |
| `diff` | Text diff algorithm |
| `js-base64` | Base64 |
| `dayjs` | Timestamp formatting |
| `spark-md5` / `js-sha1` / `js-sha256` | Hash computation |
| `jspdf` | PDF generation |
| `react-markdown` | Markdown rendering |
| `i18next` + `react-i18next` | i18n |

### 3.4 Rust Dependencies

| Crate | Purpose |
|-------|---------|
| `reqwest` | HTTP client (translation APIs) |
| `hmac` + `sha2` | TC3-HMAC-SHA256 signing (Tencent Cloud) |
| `md-5` | MD5 signing (Baidu) |
| `font-kit` | System font enumeration |
| `serde` + `serde_json` | JSON serialization |
| `libc` | PTY / POSIX system calls |
| `parking_lot` | Concurrent state management |
| `tauri-plugin-single-instance` | Single-instance enforcement |

---

## 4. Project Structure

```
firewood/
├── src-tauri/
│   ├── src/
│   │   ├── main.rs             # Entry, menu, tray, Tauri commands
│   │   ├── pty.rs              # PTY manager (create/read/write/resize/close)
│   │   └── translate.rs        # Translation API signing
│   ├── Cargo.toml
│   └── tauri.conf.json
├── src/
│   ├── main.tsx                # Entry
│   ├── App.tsx                 # Root (routing, layout)
│   ├── i18n/
│   │   ├── index.ts
│   │   └── locales/ (en.ts, zh-CN.ts)
│   ├── router/
│   │   └── tools.tsx           # Tool registry (ToolMeta list)
│   ├── types/
│   │   └── tool.ts             # ToolMeta interface
│   ├── tools/
│   │   ├── terminal/           # PTY terminal (xterm.js)
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
│   │   ├── Sidebar/
│   │   ├── ToolLayout/
│   │   ├── TitleBar/
│   │   ├── AboutDialog/
│   │   ├── SettingsDialog/
│   │   └── Updater/
│   ├── hooks/
│   │   ├── usePersistentState.ts
│   │   ├── useResizablePanels.ts
│   │   ├── useEditorFontSize.ts
│   │   ├── useToolVisibility.ts
│   │   └── useToolOrder.ts
│   └── styles/
├── DESIGN.md
├── README.md
└── README.zh-CN.md
```

---

## 5. Tool Extension

Each tool registers via `ToolMeta`:

```typescript
export interface ToolMeta {
  id: string;                                   // Unique ID, used as route path
  name: string;                                 // Sidebar display name
  icon: ReactNode;                              // Sidebar icon
  description: string;                          // Brief description
  component: LazyExoticComponent<FC>;           // Lazy-loaded component
}
```

Steps:
1. Create `src/tools/<tool-id>/` with default export component
2. Add `ToolMeta` entry in `src/router/tools.tsx`

---

## 6. App Features

### Auto Update

Tauri updater → GitHub Releases `latest.json`. Checks 3s after launch, then every 5h. Shows release notes + download progress via Ant Design notification. Tray and macOS menu support "Check for Updates".

### About Dialog

Listens for `app://about-firewood` event from Rust macOS menu. Shows version + tech stack. Version notes parsed from local `build.yml` (inlined at build time).

### State Persistence

`usePersistentState` hook wraps `localStorage`. Used for: notepad tabs, editor font sizes, terminal font settings, translation config, tool order.

### Single Instance

`tauri-plugin-single-instance`. Repeat launches focus existing window.

### System Tray

Show window, check updates, quit. Close hides to tray, doesn't quit.

### Sidebar Reorder

`useToolOrder` hook, HTML5 Drag & Drop, order persisted to localStorage.

### i18n

`i18next` + `react-i18next`. English and Simplified Chinese. Auto-detect on first launch, manual switch in settings.

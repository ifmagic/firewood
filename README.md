# Firewood

[中文文档](./README.zh-CN.md)

A cross-platform desktop toolbox for developers, built with [Tauri](https://tauri.app) + React + TypeScript.

## Tools

| Tool | Description |
|------|-------------|
| JSON Formatter | Format, minify, unescape & validate JSON; auto-collapses original input after formatting |
| Timestamp | Unix timestamp ↔ date conversion with seconds/milliseconds toggle; conversion history (up to 50 records, persisted, copyable) |
| Text Diff | Side-by-side line-by-line diff with resizable panels |
| Notepad | Multi-tab local notepad with Monaco Editor (light theme, line numbers, folding), right-click JSON formatting, delete confirmation, status bar char count |
| Base64 Codec | Base64 encode & decode |
| URL Codec | URL encode & decode |
| Hash | MD5 / SHA-1 / SHA-256 for text input and file drag-and-drop |
| Image to PDF | Multi-image layout with customizable per-page count and arrangement, exported as A4 PDF |
| Translate | Tencent Cloud / Baidu translation API, 13 languages; translation history (up to 50 records, persisted, copyable) |

### App Features

- **Sidebar drag-and-drop reorder**: Custom tool order with auto-persistence
- **Tool visibility**: Show/hide individual tools via sidebar menu
- **Single instance**: Only one process runs via tauri-plugin-single-instance; subsequent launches focus the existing window
- **System tray**: Show window, check for updates, quit
- **Auto update**: Built-in Tauri updater with release notes and download progress
- **About dialog**: Release notes parsed from local build.yml, no network required
- **Font size control**: Notepad and Translate support mouse wheel font resizing
- **i18n**: English and Simplified Chinese with auto-detection and manual switching

## Tech Stack

- **Desktop framework**: Tauri 2.x (Rust)
- **Frontend**: React 19 + TypeScript 5 + Vite 8
- **UI**: Ant Design 6.x
- **Editor**: Monaco Editor
- **Routing**: React Router DOM 7.x
- **i18n**: i18next + react-i18next
- **Rust backend**: reqwest (HTTP), hmac + sha2 (signing), md-5 (MD5), chrono (time)

## Development

```bash
# Install dependencies
npm install

# Start web dev mode (frontend only)
npm run dev

# Start Tauri dev mode (full desktop app)
npm run tauri dev

# Build
npm run tauri build
```

## Adding Tools

Create a new directory under `src/tools/` with your tool component, then register a `ToolMeta` entry in `src/router/tools.tsx`. The new tool will automatically appear in the sidebar.

See [DESIGN.md](./DESIGN.md) for detailed architecture.

## License

MIT

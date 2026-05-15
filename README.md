# Firewood

[中文文档](./README.zh-CN.md)

A cross-platform desktop toolbox for developers, built with Tauri + React + TypeScript.

## Tools

| Tool | Description |
|------|-------------|
| Terminal | Embedded local shell with PTY support, custom font selection, Unicode 11, persistent sessions |
| JSON Formatter | Format, minify, unescape & validate JSON |
| Timestamp | Unix timestamp ↔ date conversion, seconds/milliseconds toggle, history |
| Text Diff | Side-by-side line-by-line diff with resizable panels |
| Notepad | Multi-tab local notepad with Monaco Editor, right-click JSON formatting |
| Base64 Codec | Base64 encode & decode |
| URL Codec | URL encode & decode |
| Hash | MD5 / SHA-1 / SHA-256 for text and file drag-and-drop |
| Image to PDF | Multi-image layout, customizable per-page count, A4 PDF export |
| Translate | Tencent Cloud / Baidu API, 13 languages, history |

### App Features

- **Sidebar reorder**: Drag-and-drop tool ordering, auto-persisted
- **Tool visibility**: Show/hide tools via sidebar menu
- **Single instance**: One process only, repeat launches focus existing window
- **System tray**: Show window, check updates, quit
- **Auto update**: Tauri updater with release notes and download progress
- **i18n**: English and Simplified Chinese

## Tech Stack

- **Desktop**: Tauri 2.x (Rust)
- **Frontend**: React 19 + TypeScript 5 + Vite 8
- **UI**: Ant Design 6.x
- **Editor**: Monaco Editor
- **Terminal**: xterm.js + PTY (Rust)
- **Routing**: React Router DOM 7.x
- **i18n**: i18next

## Development

```bash
npm install
npm run dev          # Web dev (frontend only)
npm run tauri dev    # Tauri dev (full desktop app)
npm run tauri build  # Build
```

## Adding Tools

1. Create `src/tools/<tool-id>/` with your component
2. Register a `ToolMeta` entry in `src/router/tools.tsx`

See [DESIGN.md](./DESIGN.md) for architecture details.

## License

MIT

# Firewood

[中文文档](./README.zh-CN.md)

Firewood is a local-first desktop utility suite for developers, built with Tauri, React, and TypeScript.

It brings terminal, text/code utilities, notes, image export, and translation workflows into one lightweight app.

## Highlights

- **Local-first**: most workflows run on-device, including a native PTY-backed terminal
- **Customizable workspace**: reorder tools, hide unused entries, and keep state between launches
- **Desktop integrations**: system tray, auto update, single-instance behavior, and macOS native menus
- **Bilingual UI**: English and Simplified Chinese, with auto-detection and in-app switching

## Development

```bash
npm install
npm run dev
npm run build
npm run tauri:dev
npm run tauri:build
npm run lint
```

## Documentation

See [DESIGN.md](./DESIGN.md) for architecture, implemented tools, and extension points.

## License

MIT

# Firewood

[English](./README.md)

Firewood 是一个面向开发者的本地优先桌面工具集，基于 Tauri、React 和 TypeScript 构建。

它把终端、文本/代码处理、记事、图片转 PDF 和翻译等常用能力整合进一个轻量桌面应用。

## 特性

- **本地优先**：大多数能力本地运行，终端基于原生 PTY
- **工作区可定制**：工具可排序、可隐藏，状态会自动持久化
- **桌面集成**：支持系统托盘、自动更新、单实例和 macOS 原生菜单
- **双语界面**：内置英文与简体中文，支持自动识别和手动切换

## 开发

```bash
npm install
npm run dev
npm run build
npm run tauri:dev
npm run tauri:build
npm run lint
```

## 文档

详细架构、已实现工具和扩展方式见 [DESIGN.md](./DESIGN.md)。

## 许可证

MIT

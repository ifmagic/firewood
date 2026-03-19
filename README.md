# Firewood

面向开发者的跨平台桌面工具集，基于 [Tauri](https://tauri.app) + React + TypeScript 构建。

## 功能

| 工具 | 说明 |
|------|------|
| JSON 格式化 | 格式化、压缩与语法校验 |
| 时间戳转换 | Unix timestamp ↔ 日期互转 |
| 文本 Diff | 左右双栏逐行差异对比，支持面板宽度拖拽调整 |
| 记事本 | 多标签页、本地持久化、Monaco 编辑器、URL 点击直接打开 |
| Base64 编解码 | Base64 编码与解码 |
| URL 编解码 | URLEncode / URLDecode |
| Hash 计算 | MD5 / SHA-1 / SHA-256 |

## 技术栈

- **桌面框架**: Tauri 1.x (Rust)
- **前端**: React 19 + TypeScript 5 + Vite 8
- **UI**: Ant Design 6.x
- **编辑器**: Monaco Editor
- **路由**: React Router DOM 7.x

## 开发

```bash
# 安装依赖
npm install

# 启动 Web 开发模式（仅前端）
npm run dev

# 启动 Tauri 开发模式（完整桌面应用）
npm run tauri dev

# 构建
npm run tauri build
```

## 扩展工具

在 `src/tools/` 下新建目录并实现工具组件，然后在 `src/router/tools.tsx` 中注册 `ToolMeta` 即可。新工具会自动出现在侧边栏。

详细设计参见 [DESIGN.md](./DESIGN.md)。

## License

MIT

# Firewood

[English](./README.md)

面向开发者的跨平台桌面工具集，基于 Tauri + React + TypeScript 构建。

## 工具

| 工具 | 说明 |
|------|------|
| 终端 | 内置本地 Shell，PTY 支持，自定义字体选择，Unicode 11，会话持久化 |
| JSON 格式化 | 格式化、压缩、去除转义与语法校验 |
| 时间戳转换 | Unix 时间戳与日期互转，支持秒/毫秒切换，转换历史 |
| 文本对比 | 左右双栏逐行差异比对，支持面板宽度拖拽调节 |
| 记事本 | 多标签页、本地持久化、Monaco 编辑器、右键 JSON 格式化 |
| Base64 编解码 | Base64 编码与解码 |
| URL 编解码 | URL 编码与解码 |
| Hash 计算 | MD5 / SHA-1 / SHA-256，支持文本输入和文件拖拽 |
| 图片排版 | 多图排版，自定义每页数量，导出为 A4 尺寸 PDF |
| 文本翻译 | 腾讯云 / 百度翻译 API，13 种语言互译，翻译历史 |

### 应用特性

- **侧边栏排序**：拖拽自定义工具顺序，自动持久化
- **工具显隐**：通过侧边栏菜单控制显示或隐藏
- **单实例运行**：重复启动自动聚焦已有窗口
- **系统托盘**：显示窗口、检查更新、退出
- **自动更新**：内置更新器，展示更新日志与下载进度
- **国际化**：英文和简体中文

## 技术栈

- **桌面框架**：Tauri 2.x（Rust）
- **前端**：React 19 + TypeScript 5 + Vite 8
- **UI**：Ant Design 6.x
- **编辑器**：Monaco Editor
- **终端**：xterm.js + PTY（Rust）
- **路由**：React Router DOM 7.x
- **国际化**：i18next

## 开发

```bash
npm install
npm run dev          # Web 开发模式（仅前端）
npm run tauri dev    # Tauri 开发模式（完整桌面应用）
npm run tauri build  # 构建
```

## 扩展工具

1. 在 `src/tools/<tool-id>/` 下实现工具组件
2. 在 `src/router/tools.tsx` 中注册 `ToolMeta`

详细设计参见 [DESIGN.md](./DESIGN.md)。

## 许可证

MIT

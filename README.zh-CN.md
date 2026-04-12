# Firewood

[English](./README.md)

面向开发者的跨平台桌面工具集，基于 [Tauri](https://tauri.app) + React + TypeScript 构建。

## 工具

| 工具 | 说明 |
|------|------|
| JSON 格式化 | 格式化、压缩、去除转义与语法校验；格式化后自动收起原始输入 |
| 时间戳转换 | Unix 时间戳与日期互转，支持秒/毫秒切换；转换历史（最多 50 条，持久化，可复制详情） |
| 文本对比 | 左右双栏逐行差异比对，支持面板宽度拖拽调节 |
| 记事本 | 多标签页、本地持久化、Monaco 编辑器（亮色主题、行号、折叠）、右键 JSON 格式化、删除确认、状态栏字符统计 |
| Base64 编解码 | Base64 编码与解码 |
| URL 编解码 | URL 编码与解码 |
| Hash 计算 | MD5 / SHA-1 / SHA-256，支持文本输入和文件拖拽计算 |
| 图片排版 | 多图排版，自定义每页数量与排列方式，导出为 A4 尺寸 PDF |
| 文本翻译 | 支持腾讯云 / 百度翻译 API，13 种语言互译；翻译历史（最多 50 条，持久化，可复制详情） |

### 应用特性

- **侧边栏拖拽排序**：工具列表支持拖拽自定义顺序，排序结果自动持久化
- **工具显隐管理**：通过侧边栏菜单控制每个工具的显示或隐藏
- **单实例运行**：通过 tauri-plugin-single-instance 确保只运行一个进程，重复启动时自动聚焦已有窗口
- **系统托盘**：支持显示窗口、检查更新、退出等托盘菜单操作
- **自动更新**：内置 Tauri 更新器，检测新版本后展示更新日志与下载进度
- **关于对话框**：版本更新说明从本地 build.yml 解析，无需联网
- **字号调节**：记事本与翻译工具支持鼠标滚轮调节字体大小
- **国际化**：支持英文和简体中文，自动检测系统语言，也可在设置中手动切换

## 技术栈

- **桌面框架**：Tauri 2.x（Rust）
- **前端**：React 19 + TypeScript 5 + Vite 8
- **UI**：Ant Design 6.x
- **编辑器**：Monaco Editor
- **路由**：React Router DOM 7.x
- **国际化**：i18next + react-i18next
- **Rust 后端**：reqwest（HTTP）、hmac + sha2（签名）、md-5（MD5）、chrono（时间）

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

## 许可证

MIT

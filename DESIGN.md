# Firewood — 设计文档

## 一、项目概述

**Firewood** 是一款面向开发者的跨平台桌面工具集，集成多种常用开发辅助工具，旨在提升日常开发效率。

- **跨平台**：支持 macOS、Windows、Linux
- **轻量**：基于 Tauri，使用系统原生 WebView，无需内嵌 Chromium，安装包体积小
- **可扩展**：工具模块通过统一接口注册，新增工具无需修改核心代码

当前版本：**[latest](https://github.com/ifmagic/firewood/releases)**

---

## 二、已实现工具

| 工具 | 说明 |
|------|------|
| JSON 格式化 | 格式化、压缩、语法校验，Monaco Editor 提供语法高亮；支持折叠原始输入面板；格式化后自动收起原始输入 |
| 时间戳转换 | Unix timestamp 与人类可读日期互转，支持秒/毫秒单位切换，结果一键复制 |
| 文本对比 | 左右双栏逐行差异对比，支持面板宽度拖拽调整 |
| 记事本 | 多标签页编辑，标签支持新建（随机默认名）、重命名、关闭（二次确认）；内容持久化到 localStorage；Monaco Editor（亮色主题、行号、代码折叠）；右键菜单内置 JSON 格式化（容错解析）；底部状态栏显示当前行字符数与选中字符数；Cmd/Ctrl+Click 打开链接；鼠标滚轮调节字号 |
| Base64 编解码 | Base64 编码与解码 |
| URL 编解码 | URLEncode / URLDecode |
| Hash 计算 | MD5 / SHA-1 / SHA-256，支持文本输入和文件拖拽计算（Web Crypto API + SparkMD5） |
| 图片排版 | 多张图片合并为 A4 PDF；支持每页 1–4 张、上下/左右排列；缩略图拖拽排序；实时预览；通过 Tauri 原生对话框保存文件 |
| 文本翻译 | 支持腾讯云 / 百度翻译 API，13 种语言互译；Rust 后端实现 API 签名（TC3-HMAC-SHA256 / MD5）；API 密钥配置面板；原文译文双栏显示；鼠标滚轮调节字号 |

---

## 三、技术选型

### 3.1 核心框架

| 层级 | 技术 | 版本 |
|------|------|------|
| 桌面框架 | [Tauri](https://tauri.app) | 1.x |
| 前端框架 | React | 19.x |
| 语言 | TypeScript | 5.x |
| 构建工具 | Vite | 8.x |
| 路由 | React Router DOM | 7.x |

### 3.2 UI & 样式

| 库 | 用途 |
|----|------|
| Ant Design 6.x | 主 UI 组件库（布局、菜单、表单、通知等）|
| @ant-design/icons | 图标 |
| CSS Modules | 组件级样式隔离 |

### 3.3 功能库

| 库 | 用途 |
|----|------|
| `@monaco-editor/react` | 代码编辑器（JSON 格式化、记事本）|
| `diff` | 文本 diff 算法 |
| `js-base64` | Base64 编解码 |
| `dayjs` | 时间戳格式化 |
| `spark-md5` | MD5 计算 |
| `js-sha1` / `js-sha256` | SHA-1 / SHA-256 计算 |
| `jspdf` | 客户端 PDF 生成（图片排版工具）|
| `react-markdown` | 更新日志 Markdown 渲染 |

### 3.4 Rust 依赖（src-tauri）

| Crate | 用途 |
|-------|------|
| `reqwest` 0.11 | HTTP 客户端（翻译 API 调用）|
| `hmac` + `sha2` | TC3-HMAC-SHA256 签名（腾讯云 API）|
| `md-5` | MD5 签名（百度翻译 API）|
| `hex` | 十六进制编码 |
| `chrono` | 时间戳生成 |
| `rand` | 随机数生成（百度 salt）|
| `serde` + `serde_json` | JSON 序列化 |

### 3.5 工程规范

| 工具 | 用途 |
|------|------|
| ESLint + Prettier | 代码风格统一 |

---

## 四、项目结构

```
firewood/
├── src-tauri/                  # Tauri/Rust 后端
│   ├── src/
│   │   ├── main.rs             # 主进程入口（菜单、系统托盘、事件）
│   │   └── translate.rs        # 翻译 API 调用（腾讯云 / 百度）
│   ├── Cargo.toml
│   └── tauri.conf.json         # 应用配置（窗口、更新源、权限）
├── src/                        # React 前端
│   ├── main.tsx                # 应用入口
│   ├── App.tsx                 # 根组件（路由、布局）
│   ├── router/
│   │   └── tools.tsx           # 工具注册表（ToolMeta 列表）
│   ├── types/
│   │   └── tool.ts             # ToolMeta 接口定义
│   ├── tools/                  # 工具模块目录
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
│   │   ├── Sidebar/            # 左侧导航栏（支持拖拽排序）
│   │   ├── ToolLayout/         # 工具统一布局容器
│   │   ├── TitleBar/           # 标题栏组件
│   │   ├── FontSizeControl/    # 编辑器字号调节控件
│   │   ├── AboutDialog/        # 关于对话框（由 macOS 菜单事件触发）
│   │   └── Updater/            # 自动更新（进度条 + Markdown 更新日志）
│   ├── hooks/
│   │   ├── usePersistentState.ts   # localStorage 持久化状态
│   │   ├── useResizablePanels.ts   # 双栏拖拽分隔逻辑
│   │   ├── useEditorFontSize.ts    # 编辑器字号状态
│   │   ├── useToolVisibility.ts    # 工具显示/隐藏管理
│   │   └── useToolOrder.ts         # 工具拖拽排序持久化
│   └── styles/                 # 全局样式
├── public/
├── DESIGN.md
├── README.md
├── package.json
└── vite.config.ts
```

---

## 五、工具模块扩展

每个工具模块通过 `ToolMeta` 接口注册，注册后自动出现在侧边栏并参与路由：

```typescript
// src/types/tool.ts
export interface ToolMeta {
  id: string;                                   // 唯一 ID，同时作为路由路径
  name: string;                                 // 侧边栏显示名称
  icon: ReactNode;                              // 侧边栏图标
  description: string;                          // 简短描述
  component: LazyExoticComponent<FC>;           // 懒加载工具组件
}
```

新增工具步骤：
1. 在 `src/tools/<tool-id>/` 下创建目录并实现工具组件（默认导出）
2. 在 `src/router/tools.tsx` 中追加对应的 `ToolMeta` 条目

---

## 六、应用级特性

### 自动更新

通过 Tauri updater 实现。更新源指向 GitHub Releases 的 `latest.json`。检测到新版本后，`Updater` 组件以 Ant Design `notification` 展示更新提示，包含版本号、Markdown 渲染的更新日志及下载进度条，下载完成后提示用户重启。Windows 系统托盘支持“检查更新”菜单项。

### 关于对话框

`AboutDialog` 组件监听 `app://about-firewood` 自定义事件（由 Rust 侧 macOS 原生菜单项触发），弹出包含版本号和技术栈信息的模态对话框。

### 状态持久化

`usePersistentState` hook 封装 `localStorage`，供记事本标签列表、编辑器字号、翻译工具配置等需要跨会话保留状态的场景使用。

### 侧边栏拖拽排序

`useToolOrder` hook 管理工具列表顺序，通过 HTML5 原生 Drag & Drop API 实现拖拽排序，排序结果持久化到 `localStorage`。新增工具会自动追加到列表末尾。

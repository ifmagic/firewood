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
| JSON 格式化 | 格式化、压缩、语法校验，Monaco Editor 提供语法高亮 |
| 时间戳转换 | Unix timestamp 与人类可读日期互转 |
| 文本 Diff | 左右双栏逐行差异对比，支持面板宽度拖拽调整 |
| 记事本 | 多标签页编辑，标签支持新建、重命名、关闭；内容持久化到 localStorage；Monaco Editor；Cmd/Ctrl+Click 或 URL 识别后直接在浏览器打开链接 |
| Base64 编解码 | Base64 编码与解码 |
| URL 编解码 | URLEncode / URLDecode |
| Hash 计算 | MD5 / SHA-1 / SHA-256 |

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
| `react-markdown` | 更新日志 Markdown 渲染 |

### 3.4 工程规范

| 工具 | 用途 |
|------|------|
| ESLint + Prettier | 代码风格统一 |

---

## 四、项目结构

```
firewood/
├── src-tauri/                  # Tauri/Rust 后端
│   ├── src/main.rs             # 主进程入口（菜单、系统托盘、事件）
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
│   │   └── hash/
│   ├── components/
│   │   ├── Sidebar/            # 左侧导航栏
│   │   ├── ToolLayout/         # 工具统一布局容器
│   │   ├── FontSizeControl/    # 编辑器字号调节控件
│   │   ├── AboutDialog/        # 关于对话框（由 macOS 菜单事件触发）
│   │   └── Updater/            # 自动更新（进度条 + Markdown 更新日志）
│   ├── hooks/
│   │   ├── usePersistentState.ts   # localStorage 持久化状态
│   │   ├── useResizablePanels.ts   # 双栏拖拽分隔逻辑
│   │   └── useEditorFontSize.ts    # 编辑器字号状态
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

通过 Tauri updater 实现。更新源指向 GitHub Releases 的 `latest.json`。检测到新版本后，`Updater` 组件以 Ant Design `notification` 展示更新提示，包含版本号、Markdown 渲染的更新日志及下载进度条，下载完成后提示用户重启。

### 关于对话框

`AboutDialog` 组件监听 `app://about-firewood` 自定义事件（由 Rust 侧 macOS 原生菜单项触发），弹出包含版本号和技术栈信息的模态对话框。

### 状态持久化

`usePersistentState` hook 封装 `localStorage`，供记事本标签列表、编辑器字号等需要跨会话保留状态的场景使用。

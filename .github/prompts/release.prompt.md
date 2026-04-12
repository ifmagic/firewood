---
description: "准备新版本发布：决定版本号、全自动更新版本文件、更新 Release Body (英文)、打 tag 并推送触发 CI"
name: "Release"
argument-hint: "可选：指定目标版本号，如 v0.5.7；留空则自动判断"
agent: "agent"
---

你是 Firewood 项目的发布助手。请严格按照以下步骤完成版本发布。**请直接执行相关命令和文件修改，不要询问我是否执行。**

## 0. 环境准备 (网络代理)

本任务涉及 `git push` 和依赖更新等操作，必须在第一步就在终端中设置代理（后续所有终端操作默认在此环境中运行）：

```bash
export http_proxy=http://127.0.0.1:7890
export https_proxy=http://127.0.0.1:7890
```

## 1. 确定新版本号

1. 运行 `git tag --list 'v*' --sort=version:refname` 找到最新的 `vX.Y.Z` 格式 tag 作为上一个版本。
2. 运行 `git log --oneline <上一个tag>..HEAD` 分析变更记录。
3. 决定新版本号（不带 `v` 前缀的纯数字 `X.Y.Z`）：
   - 如果用户在调用时指定了版本号，请直接使用。
   - 否则根据变更自动判断：**patch** (仅修复/小优化) 或 **minor** (新功能/大重构)。
4. 向我简短输出你决定的新版本号及一句话理由。

## 2. 递增版本号与同步依赖 (自动执行)

确定新版本号后，直接执行以下命令或操作来更新项目中的版本号：

1. **更新 package.json**：直接在终端运行以下命令（这会自动更新 package.json 并避免生成 tag）：
   ```bash
   npm version <新版本号> --no-git-tag-version
   ```
2. **更新 Tauri 配置文件**：通过读取并修改文件：
   - `src-tauri/tauri.conf.json` → 更新 `package.version` 字段。
   - `src-tauri/Cargo.toml` → 更新 `[package]` 下的 `version` 字段。
3. **同步 Lock 文件**：在终端一并执行以下命令同步锁文件：
   ```bash
   npm install --package-lock-only
   cd src-tauri && cargo update -p firewood
   ```

## 3. 生成英文 Release Body 并更新 build.yml

分析 `git log <上一个tag>..HEAD`，将提交按类别归纳为**全英文**的发布说明（如 ✨ Features, 🐛 Bug Fixes, 🔧 Chore/Updates 等）。

读取 `.github/workflows/build.yml` 文件，找到 `create-release` step 中 `actions/github-script@v7` 的 `script` 块。将其中的 `name` 字段更新为新版本号，并将 `body: \`...\`` 模板字面量的内容替换为：**英文变更说明 + 固定的下载安装模板**。

请原样追加以下英文模板在你的变更说明下方（注意： YAML 文件中模板字面量的反引号需转义为 `\\\``，并将 `x.x.x` 替换为新版本号）：

```markdown
---

## Download

- **macOS (Apple Silicon)**: Download \`firewood_x.x.x_aarch64.dmg\`
- **macOS (Intel)**: Download \`firewood_x.x.x_x64.dmg\`
- **Windows**: Download the \`.exe\` installer

## macOS Installation Guide

Since the app is not yet notarized by Apple, you need to bypass Gatekeeper on the first launch using one of the following methods:

**Method 1 (Recommended)**: Run this single command in your Terminal to remove the quarantine attribute, then open the app normally:
```bash
xattr -cr /Applications/Firewood.app
```

**Method 2**: Open the app, and when you see the security warning, go to **System Settings -> Privacy & Security**, scroll down to find Firewood, and click **"Open Anyway"**.
```

## 4. 提交、打 Tag 并推送 (自动执行)

确认文件修改无误后，直接在终端执行以下命令（确保使用带有 `v` 前缀的 `<新版本号>`，例如 `v0.3.0`）：

```bash
git add -A
git commit -m "chore: release v<新版本号>"
git tag v<新版本号>
git push && git push origin v<新版本号>
```

执行完毕后，告知我操作已完成，GitHub Actions 将会自动开始构建。
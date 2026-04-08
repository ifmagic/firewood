---
description: "准备新版本发布：总结变更、更新 release body、递增版本号、打 tag 并推送触发 CI 构建"
name: "Release"
argument-hint: "可选：指定目标版本号，如 v0.3.0；留空则自动判断"
agent: "agent"
---

你是 Firewood 项目的发布助手。请按以下步骤完成一次版本发布。

## 0. 网络代理

本任务涉及 `git push` 等可能发起 HTTP/HTTPS 请求的操作。在第一次联网前，必须在终端中设置代理：

```bash
export http_proxy=http://127.0.0.1:7890
export https_proxy=http://127.0.0.1:7890
```

后续所有终端命令执行前均需确保代理变量已设置。

## 1. 确定上一个发布 tag

运行 `git tag --list 'v*' --sort=version:refname` 找到最新的 `vX.Y.Z` 格式 tag（这类 tag 会触发 `.github/workflows/build.yml` 里的 GitHub Actions 构建）。取排序后的最后一条作为上一个发布 tag。

## 2. 总结变更

- 运行 `git log --oneline <上一个tag>..HEAD` 获取提交列表。
- 运行 `git diff --stat <上一个tag>..HEAD` 了解变更范围。
- 将提交按类别归纳为中文发布说明，分为：✨ 新功能、🐛 修复、🔧 优化、📦 其他 等分类（没有内容的分类直接省略）。

## 3. 更新 release body

读取 [.github/workflows/build.yml] 文件，找到 `create-release` step 中 `actions/github-script@v7` 的 `script` 块，将 `body: \`...\`` 模板字面量中的内容替换为：

1. 上一步生成的变更说明。
2. 固定的下载与安装说明模板（**必须原样保留**，仅追加在变更说明之后）：

```
---

## 下载

- **macOS (Apple Silicon)**: 下载 \`firewood_x.x.x_aarch64.dmg\`
- **macOS (Intel)**: 下载 \`firewood_x.x.x_x64.dmg\`
- **Windows**: 下载 \`.exe\` 安装包

## macOS 安装说明

由于应用暂未通过 Apple 公证，首次打开需执行以下任一方式：

**方式一（推荐）**：终端运行一行命令移除隔离标记后再打开
\`\`\`bash
xattr -cr /Applications/Firewood.app
\`\`\`

**方式二**：点击打开提示风险之后, 前往系统设置 -> 隐私与安全性 -> 找到 Firewood, 点击"仍要打开"按钮
```

> 注意：模板字面量中反引号需转义为 `\\\``，版本号占位符 `x.x.x` 替换为实际新版本号。同时更新 `name` 字段中的版本号。

## 4. 决定新版本号

- 如果用户在调用时指定了版本号，使用用户指定的。
- 否则根据变更规模自动判断：
  - **patch**（如 0.2.2→0.2.3）：仅 bug 修复、文案调整、小幅优化。
  - **minor**（如 0.2.3→0.3.0）：新增功能、新增工具页面、较大重构。
- 给出你的判断理由（一句话）。

## 5. 递增所有版本号

找到项目中所有包含应用版本号的文件并统一更新为新版本号（不带 `v` 前缀）。需要更新的文件：
- `package.json` → `"version"` 字段
- `src-tauri/tauri.conf.json` → `package.version` 字段
- `src-tauri/Cargo.toml` → `[package]` 下的 `version` 字段（从本次起与应用版本保持一致）
- `src-tauri/Cargo.lock` → `[[package]] name = "firewood"` 段落的 `version`

> 注意：`package-lock.json` 的根版本会在下次 `npm install` 时自动同步，**不要**手动编辑它。
> `Cargo.lock` 中第三方 crate 的版本不要碰，只更新 `name = "firewood"` 的那一项。

## 6. 提交、打 tag、推送

通过执行以下命令来提交版本更新、打 tag 并推送到远程仓库（确保代理已设置）：

```bash
npm install --package-lock-only
git add -A
git commit -m "chore: release v<新版本号>"
git tag v<新版本号>
git push && git push origin v<新版本号>
```

确认推送成功后，告知用户新 tag 已推送，GitHub Actions 构建将自动触发。

---
description: '准备新版本发布：决定版本号、同步版本文件、更新 CHANGELOG、打 tag 并推送触发 CI'
name: 'Release'
argument-hint: '可选：指定目标版本号，如 v0.7.6；留空则自动判断'
agent: 'agent'
---

你是 Firewood 项目的发布助手。请严格按照以下步骤完成版本发布。
**请直接执行相关命令和文件修改，不要询问我是否执行。**

## 1. 确定新版本号

1. 运行 `git tag --list 'v*' --sort=version:refname` 找到最新的 `vX.Y.Z` tag 作为上一个版本。
2. 运行 `git log --oneline <上一个tag>..HEAD` 分析变更记录。
3. 决定新版本号（不带 `v` 前缀的纯数字 `X.Y.Z`）：
   - 如果用户在调用时指定了版本号，请直接使用。
   - 否则根据变更自动判断：**patch** (仅修复/小优化) 或 **minor** (新功能/大重构)。
4. 向我简短输出你决定的新版本号及一句话理由。

## 2. 递增版本号与同步依赖 (自动执行)

确定新版本号后，直接执行以下命令：

1. **更新 package.json**（不生成 tag）：
   ```bash
   npm version <新版本号> --no-git-tag-version
   ```
2. **同步 Tauri 配置与 Cargo 清单**（脚本读取 package.json 自动写入 tauri.conf.json 和 Cargo.toml）：
   ```bash
   npm run sync:version
   ```
3. **同步 Lock 文件**：
   ```bash
   npm install --package-lock-only
   cd src-tauri && cargo update -p firewood && cd ..
   ```

## 3. 更新 CHANGELOG.md

分析 `git log <上一个tag>..HEAD`，将提交按类别归纳为**全英文**的发布说明。
在 `CHANGELOG.md` 顶部（`# Changelog` 标题之后）新增一个 `## v<新版本号>` 小节，格式如下：

```markdown
## v0.7.6

### ✨ Features

- <一句话描述>

### 🐛 Bug Fixes

- <一句话描述>

### 🔧 Chore / Updates

- <一句话描述>
```

按实际变更选用对应的类别小标题，没有提交的类别可省略。CI 会自动读取该小节作为 GitHub Release 的 body，无需修改 `build.yml`。

## 4. 提交、打 Tag 并推送 (自动执行)

确认文件修改无误后，直接执行（使用带 `v` 前缀的版本号）：

```bash
git add -A
git commit -m "chore: release v<新版本号>"
git tag v<新版本号>
```

执行完毕后输出推送到远程仓库的命令，格式是`git push && git push origin v<新版本号>`。

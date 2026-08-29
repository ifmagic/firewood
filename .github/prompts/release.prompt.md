---
description: '准备新版本发布：决定版本号、同步版本文件、更新 CHANGELOG、打 tag 并推送触发 CI'
name: 'Release'
argument-hint: '可选：指定目标版本号，如 v0.8.1；留空则自动判断'
agent: 'agent'
---

你是 Firewood 项目的发布助手。你的职责是把 `main` 上已提交、已验证的变更发布为一个稳定版本。

直接执行下面的命令和文件修改，不要请求逐步确认。**但任何预检或验证失败时必须立即停止**：不要通过 `--force`、`reset`、`checkout`、`clean` 或手动改写历史来绕过问题；说明失败的检查、当前状态和下一步修复方式。

将下文的 `<VERSION>` 替换为不带 `v` 的版本号，`<PREVIOUS_TAG>` 替换为带 `v` 的上一版本 tag。

## 1. 发布预检（尚未修改文件）

依次完成以下检查；任一失败则停止发布。

1. 确认工作区干净：`git status --short` 必须没有输出。不要把已有的开发中改动带入 release commit。
2. 确认当前分支为 `main`，并且 `origin` 存在；执行 `git fetch origin --tags --prune`。
3. 确认本地 `main` 与 `origin/main` 没有 ahead/behind 差异。发布只能基于已推送的 `main` HEAD。
4. 从已合并到 HEAD 的稳定语义化版本 tag 中找出最高版本作为 `<PREVIOUS_TAG>`。忽略非 `vX.Y.Z` tag；不要把未合并的 tag 当作发布基线。
5. 获取变更范围和摘要：
   ```bash
   git log --format='%h%x09%s' <PREVIOUS_TAG>..HEAD
   git diff --stat <PREVIOUS_TAG>..HEAD
   ```
   若范围为空，停止发布。

## 2. 决定并校验版本号

1. 若用户指定 `vX.Y.Z` 或 `X.Y.Z`，去掉单个可选的 `v` 前缀后使用它；否则根据上述变更和实际 diff 决定版本号：
   - 仅 bug fix、小型 UX/性能改进或维护改动使用 **patch**。
   - 有用户可见的新功能、新工具或显著工作流改动使用 **minor**。
   - **major** 只在用户明确指定时使用，不要自动推断。
2. `<VERSION>` 必须严格匹配 `X.Y.Z`，且按数值语义化版本比较必须大于 `<PREVIOUS_TAG>` 和当前清单版本。不要接受 prerelease、日期版本或字符串排序结果。
3. 确认本地和远端都不存在 `v<VERSION>`。若 tag 已存在，停止，绝不覆盖或移动 tag。
4. 在开始改动前，简短输出：`Release v<VERSION> from <PREVIOUS_TAG>: <one-sentence reason>.`

## 3. 同步版本与编写 Changelog

1. 更新 npm 根包及其 lockfile，但不创建 npm 的 commit 或 tag：
   ```bash
   npm version <VERSION> --no-git-tag-version
   ```
2. 使用项目脚本同步 Tauri 与 Cargo 的 package version：
   ```bash
   npm run sync:version
   ```
3. 不要运行 `npm install --package-lock-only` 或 `cargo update`。它们会重新解析依赖，不能用于版本号同步。`npm version` 负责 `package-lock.json` 的根版本；随后运行的 Cargo 验证会在需要时更新 `src-tauri/Cargo.lock` 中的根包版本。
4. 在 `CHANGELOG.md` 的 `# Changelog` 标题之后新增且仅新增一个精确的 `## v<VERSION>` 小节。CI 以这个精确标题读取 GitHub Release body。
   - 全部使用英文，并沿用现有标题：`### ✨ Features`、`### 🐛 Bug Fixes`、`### 🔧 Chore / Updates`。
   - 根据 `<PREVIOUS_TAG>..HEAD` 的实际变更归纳用户可感知内容和重要维护改动；合并重复提交，不要逐条转写 commit subject。
   - 忽略 release commit、版本号、lockfile churn 和无意义的内部整理；不得编造未发生的功能或修复。
   - 只保留实际有内容的分类，并保持最新版本在最上方。

## 4. 发布前验证

先确认 `package.json`、`package-lock.json` 根 package、`src-tauri/tauri.conf.json` 和 `src-tauri/Cargo.toml` 的版本均为 `<VERSION>`。然后依次执行：

```bash
npm run lint
npm test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml

```

任何命令失败时停止，不提交、不打 tag、不推送。验证成功后检查 `git status --short`：只能出现下列发布文件。若有额外文件，停止，不要暂存它们。

```text
CHANGELOG.md
package.json
package-lock.json
src-tauri/Cargo.toml
src-tauri/Cargo.lock
src-tauri/tauri.conf.json
```

## 5. 提交、打 tag 并推送

1. 只暂存明确的发布文件，绝不使用 `git add -A`：
   ```bash
   git add CHANGELOG.md package.json package-lock.json src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/tauri.conf.json
   git diff --cached --check
   git diff --cached --name-only
   ```
   核对暂存文件仍只属于上面的白名单，并检查暂存 diff 中的版本号、Changelog 和 lockfile 根版本。
2. 创建 release commit 和轻量 tag：
   ```bash
   git commit -m "chore: release v<VERSION>"
   git tag v<VERSION>
   ```
   确认 tag 指向刚创建的 commit。
3. 使用原子推送同时更新远端 `main` 和 tag，避免只有其中一个成功：
   ```bash
   git push --atomic origin HEAD:main v<VERSION>
   ```
   GitHub Actions 会由该 tag 自动构建并发布；不要额外修改 workflow 文件。
4. 成功后输出版本号、上一 tag、release commit SHA、已执行的验证项，以及 CI 已被 tag 触发。若推送失败，报告失败结果且不要强推。

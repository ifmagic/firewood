# Changelog

## v0.8.3

### ✨ Features

- Add a macOS overlay title bar with a persistent always-on-top control.

### 🐛 Bug Fixes

- Restore Notepad JSON syntax highlighting and code folding when content is edited.
- Ensure Terminal refreshes repaint reliably in Tauri's WKWebView.

### 🔧 Chore / Updates

- Improve release changelog retrieval and refine the macOS CI build matrix.

## v0.8.2

### ✨ Features

- Migrate Notepad and JSON Formatter to CodeMirror 6, with code-focused JSON editing features such as syntax highlighting, folding, bracket matching, and completion.
- Add a Terminal refresh control and automatic display repainting after display-scale changes.

### 🐛 Bug Fixes

- Prevent long documents in Tauri's WKWebView from jumping back to the previous caret position after a click.
- Align JSON Formatter diagnostics with its JSONC support so valid comments and trailing commas are not reported as errors.

### 🔧 Chore / Updates

- Reduce oversized bundles for the Abacus and Image-to-PDF tools.

## v0.8.1

### ✨ Features

- Localize the Terminal interface and add an option to lock individual terminal tabs.

### 🐛 Bug Fixes

- Improve terminal startup, command execution, shell lifecycle handling, and recovery from closed shells.
- Preserve terminal scrollback when clearing the screen and limit font choices to compatible monospace families.
- Prevent duplicate consecutive timestamp conversion entries.

### 🔧 Chore / Updates

- Refine sidebar hierarchy and settings-menu presentation.
- Update the GitHub Actions `github-script` action to v9.

## v0.8.0

### ✨ Features

- Replace the standalone Timestamp tool with Abacus, a unified calculator and Unix timestamp conversion workspace.
- Add scientific expression controls, automatic seconds/milliseconds detection, quick timestamp presets, and persistent calculation and conversion history.

## v0.7.8

### ✨ Features

- Add the new Moxia novel-writing workspace with local book, chapter, and character management.
- Add a command palette to speed up Moxia navigation and actions.
- Refresh Moxia detail panels with reusable section cards and missing-book detection.

### 🐛 Bug Fixes

- Restore editor focus handoff across Moxia editing flows.
- Correct relation name direction handling and improve character card prompt context generation.

### 🔧 Chore / Updates

- Restructure the Moxia layout for better accessibility and a more consistent workspace UI.

## v0.7.7

### ✨ Features

- Add a shared Monaco compatibility hook to improve editor behavior on Tauri macOS builds.

### 🐛 Bug Fixes

- Drain PTY sessions on exit and add Ctrl+L support to clear the terminal.

### 🔧 Chore / Updates

- Add an AGENTS guide that documents repository conventions for contributors.

## v0.7.6

### ✨ Features

- Add a collapsible sidebar and refresh the Terminal and JSON Formatter tool icons.

### 🐛 Bug Fixes

- Restore Monaco find-widget dismissal by fixing the editor unescape handling.
- Remove IME flicker and micro-jitter issues in the Notepad editor.
- Resolve the remaining ESLint errors across four UI components.

### 🔧 Chore / Updates

- Centralize release version management across the changelog, package metadata, and Tauri manifests.
- Modernize the Text Diff tool with simpler naming and a streamlined implementation.
- Remove the unused Base64, URL, and Hash tools from the app.
- Refresh the release prompt and remove the obsolete code-task prompt.

## v0.7.5

### ✨ Features

- Add dedicated Firewood and Diffchecker pages with richer UI components.

### 🔧 Chore / Updates

- Simplify the Notepad stylesheet by removing unused CSS and tightening the layout.
- Clean up Playwright configuration files and refresh .gitignore entries.

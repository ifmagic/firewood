# Changelog

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

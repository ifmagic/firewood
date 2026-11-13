# Firewood — Design Document

## 1. Overview

**Firewood** is a local-first desktop utility suite for common developer workflows.

- **Desktop-native**: built with Tauri and system WebView, with Rust for native capabilities
- **Modular**: each tool is registered through a shared `ToolMeta` contract
- **Stateful**: tool state, ordering, visibility, and preferences are persisted locally
- **Practical**: combines terminal, text/code utilities, note taking, diffing, calculation, and image export

## 2. Implemented Tools

| Tool           | Current implementation                                                                                                                                                                                      |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Terminal       | Multi-tab local shell with Rust PTY backend, shell selection, system font selection, font size control, UTF-8-safe output streaming, and session continuity across navigation                               |
| JSON Formatter | CodeMirror 6 editor with format, minify, unescape, JSONC-aware formatting, copy/clear actions, and persisted content                                                                                        |
| Numbox         | Instrument-style calculator and timestamp workspace with mathjs expression evaluation, hex/binary readouts, unix timestamp/date conversion, automatic seconds/milliseconds detection, and persisted history |
| Diff           | GitHub-style unified review diff with line numbers, inline word highlights, collapsed unchanged sections, expand-all controls, and persisted inputs                                                         |
| Notepad        | Multi-tab local notes and file editing (up to 20 tabs) with CodeMirror 6, local open/save, JSON formatting, and persisted tab state                                                                         |
| Image to PDF   | Multi-image A4 export with 1-4 images per page, layout presets, drag reorder, preview paging, optional size limit, and save dialog integration                                                              |

## 3. Tech Stack

### 3.1 Core

| Layer           | Technology              |
| --------------- | ----------------------- |
| Desktop runtime | Tauri 2                 |
| Frontend        | React 19 + TypeScript 5 |
| Build tool      | Vite 8                  |
| Routing         | React Router DOM 7      |

### 3.2 UI and shared libraries

| Library                     | Purpose                                     |
| --------------------------- | ------------------------------------------- |
| Ant Design 6                | Main UI components                          |
| CSS Modules                 | Component-scoped styling                    |
| `@codemirror/*`             | Code and note editing (CodeMirror 6)        |
| `@xterm/xterm` + addons     | Terminal rendering, fit, links, Unicode 11  |
| `diff`                      | Text diffing                                |
| `mathjs`                    | Calculator expression evaluation            |
| `dayjs`                     | Time handling                               |
| `jspdf`                     | PDF generation                              |
| `jsonc-parser`              | JSONC-tolerant parsing, formatting, linting |
| `react-markdown`            | Release note rendering                      |
| `i18next` + `react-i18next` | Internationalization                        |

### 3.3 Rust-side dependencies

| Crate / plugin                                   | Purpose                                    |
| ------------------------------------------------ | ------------------------------------------ |
| `font-kit`                                       | System font discovery                      |
| `libc`                                           | PTY and process integration                |
| `parking_lot`                                    | PTY manager synchronization                |
| `rand`                                           | PTY session ID generation                  |
| `portable-pty`                                   | ConPTY sessions on Windows (10 1809+)      |
| `tauri-plugin-updater`                           | App updates                                |
| `tauri-plugin-single-instance`                   | Single-instance behavior in release builds |
| `tauri-plugin-dialog`, `fs`, `opener`, `process` | Native file/system integrations            |

## 4. Architecture

### 4.1 Frontend shell

- `src/App.tsx` wires the system appearance theme, router, titlebar, sidebar, updater, and about dialog
- `src/components/Sidebar/` owns navigation, visibility toggles, and drag reorder
- `src/components/SettingsMenuButton/` exposes language switching, update checks, and About entry
- `src/components/TitleBar/` and `PinToggle/` provide per-platform window chrome and the always-on-top control
- `src/components/ToolLayout/`, `StatusBar/`, `FontSizeControl/`, and `EmptyState/` provide shared tool chrome

### 4.2 Tool registry and shared state

- `src/router/tools.tsx` is the single source of truth for tool registration
- `src/types/tool.ts` defines the `ToolMeta` contract used by every tool
- Shared hooks:
  - `usePersistentState` for localStorage-backed state
  - `useToolOrder` for persisted tool ordering
  - `useToolVisibility` for sidebar visibility
  - `useSidebarCollapsed` for the collapsed sidebar rail
  - `useSystemAppearance` for the system light/dark preference
  - `useAlwaysOnTop` for the persistent window pin
  - `useResizablePanels` for split-pane tools
  - `useEditorFontSize` for shared editor font controls
  - `useCodemirror` for the shared CodeMirror 6 editor and its find/replace panel

### 4.3 Native bridge

- `src-tauri/src/main.rs` registers commands, tray behavior, updater integration, and macOS menu wiring
- `src-tauri/src/pty.rs` manages terminal session lifecycle, IO, and resizing

### 4.4 Release-note flow

- `src/components/Updater/` checks for updates, renders changelog snippets, downloads and installs the update, then restarts the app
- `src/utils/updateNotes.ts` extracts changelog content from release bodies and from the bundled `CHANGELOG.md`
- `src/components/AboutDialog/` shows the current version and reads the bundled `CHANGELOG.md` section for that version

## 5. Project Structure

```text
firewood/
├── .github/
│   └── workflows/
│       └── build.yml
├── scripts/
│   └── sync-version.mjs
├── src-tauri/
│   ├── capabilities/
│   │   └── default.json
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── tauri.dev.conf.json
│   ├── tauri.macos.conf.json
│   ├── tauri.windows.conf.json
│   └── src/
│       ├── main.rs
│       └── pty.rs
├── src/
│   ├── App.tsx
│   ├── App.css
│   ├── index.css
│   ├── main.tsx
│   ├── components/
│   │   ├── AboutDialog/
│   │   ├── EditorContextMenu.tsx
│   │   ├── EmptyState/
│   │   ├── FontSizeControl/
│   │   ├── MarkdownBody/
│   │   ├── PinToggle/
│   │   ├── SettingsMenuButton/
│   │   ├── Sidebar/
│   │   ├── StatusBar/
│   │   ├── TitleBar/
│   │   ├── ToolLayout/
│   │   └── Updater/
│   ├── hooks/
│   │   ├── cmSearchPanel.ts
│   │   ├── useAlwaysOnTop.ts
│   │   ├── useCodemirror.ts
│   │   ├── useEditorFontSize.ts
│   │   ├── usePersistentState.ts
│   │   ├── useResizablePanels.ts
│   │   ├── useSidebarCollapsed.ts
│   │   ├── useSystemAppearance.ts
│   │   ├── useToolOrder.ts
│   │   └── useToolVisibility.ts
│   ├── i18n/
│   │   ├── index.ts
│   │   └── locales/
│   ├── router/
│   │   └── tools.tsx
│   ├── theme/
│   │   └── palette.ts
│   ├── tools/
│   │   ├── img-to-pdf/
│   │   ├── json-formatter/
│   │   ├── notepad/
│   │   ├── numbox/
│   │   ├── terminal/
│   │   └── text-diff/
│   ├── types/
│   │   └── tool.ts
│   └── utils/
│       ├── charcoal.ts
│       ├── detectLanguage.ts
│       ├── jsonText.ts
│       ├── platform.ts
│       ├── updateNotes.ts
│       └── wkWebViewFocusShim.ts
├── AGENTS.md
├── CHANGELOG.md
├── DESIGN.md
└── README.md
```

## 6. Extension Model

Each tool is registered through `ToolMeta`:

```ts
export interface ToolMeta {
  id: string;
  name: string;
  icon: ReactNode;
  component: LazyExoticComponent<FC>;
}
```

To add a new tool:

1. Create `src/tools/<tool-id>/index.tsx` and export the tool component
2. Register the tool in `src/router/tools.tsx`
3. Add i18n labels if the tool needs localized names or text

## 7. Runtime Features

### Sidebar customization

Users can reorder tools and toggle visibility from the sidebar menu. Both order and visibility are persisted locally.

### Persistence

Most tools store working state locally, including note tabs, editor font sizes, diff inputs, and calculator and timestamp history.

### Updates

The updater checks once shortly after launch and then every 5 hours. Manual checks are available from both the tray menu and the in-app settings menu.

### About and release notes

The About dialog opens from the sidebar settings menu, shows the app version, links to the GitHub repository, and displays bundled release notes for the current build.

### Tray and window lifecycle

The app provides a tray icon with show, update, and quit actions. Closing the window hides the app instead of quitting.

### Language support

English and Simplified Chinese are built in. The initial language is auto-detected, and users can switch languages from the settings menu.

### Single-instance release behavior

In non-debug builds, re-launching the app focuses the existing window instead of opening a second instance.

## 8. Visual Design System

The UI is one warm, workshop-grade system called **Ember & Timber**: paper-toned
content surfaces, charred-timber "workbench" surfaces for instruments (terminal,
calculator display, diff output), warm ink text, and a single ember accent. The
design thesis is a dark instrument set into a light workbench; the signature
element is the ember rail / amber readout, not decoration.

### 8.1 Appearance

- The app follows the system appearance via `prefers-color-scheme` (CSS) and
  `useSystemAppearance()` + Ant Design's `darkAlgorithm` (JS). **There is no
  in-app appearance switch** — Dark Mode guidance says apps should respect the
  systemwide choice.
- Semantic colors live in `src/index.css` (CSS), `src/theme/palette.ts` (Ant
  Design) and `src/utils/charcoal.ts` (the instrument scale shared with xterm).
  A component must not introduce a literal semantic color; the only exceptions
  are pure white on accent/close-red surfaces and the platform-mandated Windows
  close red.
- Charcoal workbench tokens are intentionally identical in both appearances:
  instruments stay dark. Content surfaces flip from `#faf9f6` to `#1d1915`.

### 8.2 Color roles

| Role           | Light                 | Dark      | Notes                         |
| -------------- | --------------------- | --------- | ----------------------------- |
| canvas         | `#faf9f6`             | `#1d1915` | app/content background        |
| raised         | `#fffefb`             | `#26211b` | inputs, default buttons       |
| subtle         | `#f6f4ee`             | `#26211b` | toolbars, cards               |
| sunken         | `#f3f0e9`             | `#17130f` | status bars, table heads      |
| strong text    | `#2a241e`             | `#f5f0e8` | 14.5:1+                       |
| body text      | `#5f574d`             | `#d6cdbf` | 6.7:1+                        |
| tertiary text  | `#6f6557`             | `#9c9181` | ≥4.5:1 — safe for 11px labels |
| accent (icons) | `#e8590c`             | `#f08a4b` | never for small text          |
| accent ink     | `#b54708`             | `#f5b36b` | links, chips, small text      |
| action         | `#c2410c`             | `#c2410c` | white text is 5.18:1          |
| success        | `#4f5d3a`             | `#9fce9a` | history date chips            |
| diff add / del | `#7fce9a` / `#ff9d85` | same      | charcoal workbench only       |

`src/theme/palette.test.ts` locks these contrast guarantees in CI.

### 8.3 Type

System sans (SF Pro Text / PingFang SC) and one mono stack. No display face.

| Step    | Size / line-height | Use                                  |
| ------- | ------------------ | ------------------------------------ |
| display | 32 / 1.1 mono 600  | calculator result                    |
| title   | 16 / 1.3 600       | tool titles, dialog titles           |
| body    | 14 / 1.5           | prose, buttons, menus                |
| label   | 13 / 1.4           | headers, form labels                 |
| caption | 12 / 1.4           | status bars, hints                   |
| micro   | 11 / 1.3 600       | dense metadata only, must pass 4.5:1 |

Weights are 400 / 500 / 600 only. Numeric UI uses `tabular-nums`.

### 8.4 Layout, shape, elevation

- Spacing: 4 / 8 / 12 / 16 / 24 / 32. Tool pages use 16px top and 24px side
  padding.
- Radii: 8px controls, 12px panels/tool frames, 16px dialogs, 999px pills.
- One elevation token for floating layers (menus, modals, popovers). Content
  cards are separated by a 1px divider, never a shadow.
- Every tool uses the same 44px header bar attached to its work area; it is not
  a floating card. Terminal/Notepad tab strips occupy the same slot.

### 8.5 Interaction and accessibility

- Desktop minimum hit target is 28×28px; visual glyphs may be smaller, the
  button box may not.
- Focus is always a 2px ember outline with 2px offset (or the antd input halo).
  Never remove it without an equivalent.
- Icon-only controls need `aria-label`; menus use Ant Design's Dropdown so Esc,
  arrow keys, and focus return are not reimplemented.
- Empty states use the shared `EmptyState` (one quiet ember mark + instruction),
  not Ant Design's default illustration.
- Every animation must survive `prefers-reduced-motion` (global guard in
  `src/index.css`).

### 8.6 Do not

- Do not introduce a second accent hue (a GitHub-blue diff surface reads as a
  different product).
- Do not apply glassmorphism or Liquid Glass to content; those materials are for
  the floating functional layer only.
- Do not introduce a hard-coded brand/semantic color or motion duration in a
  tool — use the shared tokens. Font sizes follow the type scale; structural
  radii (999px pills, 50% circles, one-off control accents) stay local.
- Do not add an app-specific light/dark toggle.

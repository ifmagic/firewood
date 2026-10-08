import type { Terminal } from '@xterm/xterm';
import i18n from '../../i18n';

export interface BufferedOutputState {
  bufferedOutput: string[];
  bufferedChars: number;
}

const MAX_BUFFER_CHARS = 100_000;

export function appendBufferedOutput(tab: BufferedOutputState, data: string) {
  if (!data) return;
  tab.bufferedOutput.push(data);
  tab.bufferedChars += data.length;

  while (tab.bufferedChars > MAX_BUFFER_CHARS && tab.bufferedOutput.length > 0) {
    const removed = tab.bufferedOutput.shift() ?? '';
    tab.bufferedChars -= removed.length;
  }
}

export function clearBufferedOutput(tab: BufferedOutputState) {
  tab.bufferedOutput = [];
  tab.bufferedChars = 0;
}

export function selectActiveTab<T extends { id: string }>(tabs: T[], activeId: string | null): string | null {
  if (activeId && tabs.some((tab) => tab.id === activeId)) {
    return activeId;
  }
  return tabs[0]?.id ?? null;
}

export function getShellDisplayName(shellPath: string | null, defaultShell: string) {
  const target = shellPath || defaultShell;
  if (!target) return i18n.t('terminal.defaultShellName');
  return target.split(/[\\/]/).pop() || target;
}

/**
 * Directory the shell picker should open at, given a shell path. Handles both
 * separators: shells are POSIX paths on macOS/Linux and drive-qualified paths
 * on Windows, and the picker needs that platform's own separator back for
 * `defaultPath` to resolve.
 * Returns '' when there is nothing usable to open (a bare command name, or a
 * path at the filesystem root), in which case the dialog falls back to its own
 * default location.
 */
export function getShellDirectory(shellPath: string): string {
  const trimmed = shellPath.trim();
  const index = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
  const parent = index > 0 ? trimmed.slice(0, index) : '';
  // `C:` is a drive-relative path, not a directory the dialog can open; the
  // root itself is the closest usable location. `/` and the bare command name
  // both yield '' so the dialog picks its own default.
  return /^[A-Za-z]:$/.test(parent) ? `${parent}\\` : parent;
}

/**
 * VS Code-style clipboard chords for Windows/Linux.
 *
 * xterm.js only wires the DOM copy/paste pipeline up for chords it does not
 * consume itself — Cmd+C/V on macOS. A bare Ctrl+C or Ctrl+V on Windows/Linux
 * is turned into `\x03` / `\x16` by the key encoder and the keydown is
 * preventDefault-ed, so the browser never runs its native copy/paste action
 * and the selection is silently never copied. VS Code instead copies when text
 * is selected (and only forwards ^C as SIGINT when there is none), and always
 * pastes on Ctrl+V.
 *
 * Returning false from the custom handler makes xterm stand down *without*
 * cancelling the event: the browser then performs its default action, which
 * fires the DOM `copy` / `paste` events xterm's own listeners already handle.
 *
 * Ctrl+Shift+C/V are deliberately not claimed here: xterm has no binding for
 * them either, so whatever the host browser does with those chords (WebView2
 * may route Ctrl+Shift+C to DevTools) is what the user gets. The supported
 * chords are Ctrl+C / Ctrl+V. macOS keeps the untouched native pipeline.
 */
export function attachClipboardKeyHandler(term: Terminal) {
  term.attachCustomKeyEventHandler((event) => {
    if (event.type !== 'keydown') return true;
    // Other-modifier chords are never ours; AltGr arrives as Ctrl+Alt on
    // Windows and must reach the shell as a composed character.
    if (!event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) {
      return true;
    }

    // `code` covers layouts where the letter key does not produce a latin
    // 'c'/'v' character (e.g. Cyrillic layouts).
    const isCopyChord = event.key.toLowerCase() === 'c' || event.code === 'KeyC';
    const isPasteChord = event.key.toLowerCase() === 'v' || event.code === 'KeyV';

    if (isCopyChord) {
      // Copy when there is a selection; otherwise let ^C through as SIGINT.
      return !term.hasSelection();
    }
    if (isPasteChord) {
      return false;
    }
    return true;
  });
}

/**
 * The shell picker's option list: the detected (system) default, then the
 * remembered pick, the probed shells and the current tab's shell.
 * `detectedShell` must stay in the list even when a preference is remembered:
 * on macOS it comes from `$SHELL` (e.g. /opt/homebrew/bin/zsh), which the
 * hardcoded unix probe list in `list_shells` does not contain — dropping it
 * would make the user's login shell unselectable after picking another one.
 * Picking it back clears the preference (see `toShellOverride`).
 */
export function buildShellOptions(
  detectedShell: string,
  rememberedShell: string,
  availableShells: string[],
  currentShell: string,
) {
  return [...new Set([detectedShell, rememberedShell, ...availableShells, currentShell].filter(Boolean))];
}

export function toShellOverride(selectedShell: string, defaultShell: string) {
  return selectedShell === defaultShell ? null : selectedShell;
}

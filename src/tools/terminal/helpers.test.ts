import { describe, expect, it, vi } from 'vitest';
import type { Terminal } from '@xterm/xterm';
import {
  appendBufferedOutput,
  attachClipboardKeyHandler,
  buildShellOptions,
  clearBufferedOutput,
  getShellDirectory,
  getShellDisplayName,
  selectActiveTab,
  toShellOverride,
  type BufferedOutputState,
} from './helpers';
import '../../i18n';

function newBuffer(): BufferedOutputState {
  return { bufferedOutput: [], bufferedChars: 0 };
}

function keyEvent(init: Partial<KeyboardEvent>): KeyboardEvent {
  return {
    type: 'keydown',
    key: '',
    code: '',
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    metaKey: false,
    ...init,
  } as KeyboardEvent;
}

/**
 * Captures the handler `attachClipboardKeyHandler` installs, so the policy can
 * be asserted directly. The end-to-end effect of returning false (xterm stands
 * down *without* cancelling, the browser's copy/paste then fires xterm's own
 * DOM listeners) is pinned against the real @xterm/xterm in
 * real-xterm.test.ts.
 */
function capturedHandler(hasSelection: boolean) {
  let handler: ((event: KeyboardEvent) => boolean) | null = null;
  const term = {
    hasSelection: () => hasSelection,
    attachCustomKeyEventHandler: (next: (event: KeyboardEvent) => boolean) => {
      handler = next;
    },
  } as unknown as Terminal;

  attachClipboardKeyHandler(term);
  return handler!;
}

describe('appendBufferedOutput', () => {
  it('appends chunks and tracks the char count', () => {
    const tab = newBuffer();

    appendBufferedOutput(tab, 'hello');
    appendBufferedOutput(tab, ' world');

    expect(tab.bufferedOutput).toEqual(['hello', ' world']);
    expect(tab.bufferedChars).toBe(11);
  });

  it('ignores empty chunks', () => {
    const tab = newBuffer();

    appendBufferedOutput(tab, '');

    expect(tab.bufferedOutput).toEqual([]);
    expect(tab.bufferedChars).toBe(0);
  });

  it('drops the oldest chunks once the cap is exceeded', () => {
    const tab = newBuffer();

    appendBufferedOutput(tab, 'a'.repeat(60_000));
    appendBufferedOutput(tab, 'b'.repeat(60_000));

    expect(tab.bufferedOutput).toEqual(['b'.repeat(60_000)]);
    expect(tab.bufferedChars).toBe(60_000);
  });

  it('keeps chunks exactly at the cap', () => {
    const tab = newBuffer();

    appendBufferedOutput(tab, 'a'.repeat(100_000));

    expect(tab.bufferedOutput).toEqual(['a'.repeat(100_000)]);
    expect(tab.bufferedChars).toBe(100_000);
  });

  it('drops a single chunk larger than the cap entirely', () => {
    const tab = newBuffer();

    appendBufferedOutput(tab, 'x'.repeat(100_001));

    expect(tab.bufferedOutput).toEqual([]);
    expect(tab.bufferedChars).toBe(0);
  });
});

describe('clearBufferedOutput', () => {
  it('resets the buffer and the char count', () => {
    const tab = newBuffer();
    appendBufferedOutput(tab, 'data');

    clearBufferedOutput(tab);

    expect(tab.bufferedOutput).toEqual([]);
    expect(tab.bufferedChars).toBe(0);
  });
});

describe('selectActiveTab', () => {
  const tabs = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

  it('keeps a valid active id', () => {
    expect(selectActiveTab(tabs, 'b')).toBe('b');
  });

  it('falls back to the first tab when the active id is stale', () => {
    expect(selectActiveTab(tabs, 'gone')).toBe('a');
  });

  it('falls back to the first tab when the active id is null', () => {
    expect(selectActiveTab(tabs, null)).toBe('a');
  });

  it('returns null for an empty tab list', () => {
    expect(selectActiveTab([], 'a')).toBeNull();
    expect(selectActiveTab([], null)).toBeNull();
  });
});

describe('getShellDisplayName', () => {
  it('derives the basename from a unix path', () => {
    expect(getShellDisplayName('/opt/homebrew/bin/fish', '/bin/zsh')).toBe('fish');
  });

  it('derives the basename from a windows-style path', () => {
    expect(getShellDisplayName('C:\\Tools\\pwsh.exe', '/bin/zsh')).toBe('pwsh.exe');
  });

  it('falls back to the default shell basename', () => {
    expect(getShellDisplayName(null, '/bin/zsh')).toBe('zsh');
    expect(getShellDisplayName('', '/bin/bash')).toBe('bash');
  });

  it('falls back to the localized generic name when both are missing', () => {
    expect(getShellDisplayName(null, '')).toBe('Shell');
  });
});

describe('getShellDirectory', () => {
  it('returns the parent of a unix shell path', () => {
    expect(getShellDirectory('/opt/homebrew/bin/fish')).toBe('/opt/homebrew/bin');
  });

  it('returns the parent of a windows shell path, drive included', () => {
    expect(getShellDirectory('C:\\Program Files\\Git\\bin\\bash.exe')).toBe('C:\\Program Files\\Git\\bin');
  });

  it('treats a trailing separator as the directory itself', () => {
    expect(getShellDirectory('/usr/local/bin/')).toBe('/usr/local/bin');
    expect(getShellDirectory('C:\\Tools\\')).toBe('C:\\Tools');
  });

  it('returns the drive root instead of the ambiguous drive-relative C:', () => {
    expect(getShellDirectory('C:\\bash.exe')).toBe('C:\\');
    expect(getShellDirectory('C:\\')).toBe('C:\\');
  });

  it('returns an empty string for a bare command name or empty input', () => {
    expect(getShellDirectory('powershell.exe')).toBe('');
    expect(getShellDirectory('')).toBe('');
    expect(getShellDirectory('/zsh')).toBe('');
  });
});

// Windows/Linux clipboard policy. xterm encodes a bare Ctrl+C/Ctrl+V and
// preventDefault-s the keydown, so these chords have to be handed back to the
// browser off macOS; see real-xterm.test.ts for the behavioural half.
describe('attachClipboardKeyHandler', () => {
  it('sends ^C on Ctrl+C when nothing is selected', () => {
    const handler = capturedHandler(false);
    expect(handler(keyEvent({ key: 'c', code: 'KeyC', ctrlKey: true }))).toBe(true);
  });

  it('lets the browser copy on Ctrl+C when text is selected', () => {
    const handler = capturedHandler(true);
    expect(handler(keyEvent({ key: 'c', code: 'KeyC', ctrlKey: true }))).toBe(false);
  });

  it('lets the browser paste on Ctrl+V regardless of selection', () => {
    for (const hasSelection of [true, false]) {
      const handler = capturedHandler(hasSelection);
      expect(handler(keyEvent({ key: 'v', code: 'KeyV', ctrlKey: true }))).toBe(false);
    }
  });

  it('accepts the physical key on layouts that do not emit latin c/v', () => {
    const handler = capturedHandler(true);
    // Cyrillic 'с' / 'м' style keys: the latin `key` never matches, `code` does.
    expect(handler(keyEvent({ key: 'с', code: 'KeyC', ctrlKey: true }))).toBe(false);
    expect(handler(keyEvent({ key: 'м', code: 'KeyV', ctrlKey: true }))).toBe(false);
  });

  it('leaves shifted, AltGr and modified chords to xterm', () => {
    const handler = capturedHandler(true);
    // Ctrl+Shift+C/V are nobody's binding: xterm ignores them, so they fall
    // through to whatever the host browser does with the chord.
    expect(handler(keyEvent({ key: 'C', code: 'KeyC', ctrlKey: true, shiftKey: true }))).toBe(true);
    expect(handler(keyEvent({ key: 'V', code: 'KeyV', ctrlKey: true, shiftKey: true }))).toBe(true);
    // AltGr (Ctrl+Alt) must reach the shell as a composed character.
    expect(handler(keyEvent({ key: 'q', code: 'KeyQ', ctrlKey: true, altKey: true }))).toBe(true);
    expect(handler(keyEvent({ key: 'c', code: 'KeyC', metaKey: true }))).toBe(true);
    expect(handler(keyEvent({ key: 'c', code: 'KeyC' }))).toBe(true);
    expect(handler(keyEvent({ key: 'a', code: 'KeyA', ctrlKey: true }))).toBe(true);
    expect(handler(keyEvent({ type: 'keyup', key: 'c', code: 'KeyC', ctrlKey: true }))).toBe(true);
  });

  it('is only installed once per terminal', () => {
    const attach = vi.fn();
    attachClipboardKeyHandler({ attachCustomKeyEventHandler: attach } as unknown as Terminal);
    expect(attach).toHaveBeenCalledTimes(1);
  });
});

describe('buildShellOptions', () => {
  it('merges default, available, and current shells without duplicates', () => {
    expect(buildShellOptions('/bin/zsh', ['/bin/bash', '/bin/zsh'], '/bin/fish')).toEqual([
      '/bin/zsh',
      '/bin/bash',
      '/bin/fish',
    ]);
  });

  it('filters out empty values', () => {
    expect(buildShellOptions('', [''], '/bin/bash')).toEqual(['/bin/bash']);
  });
});

describe('toShellOverride', () => {
  it('returns null when the selection equals the default shell', () => {
    expect(toShellOverride('/bin/zsh', '/bin/zsh')).toBeNull();
  });

  it('returns the selection when it differs from the default shell', () => {
    expect(toShellOverride('/bin/fish', '/bin/zsh')).toBe('/bin/fish');
  });
});

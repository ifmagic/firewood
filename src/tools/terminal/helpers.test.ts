import { describe, expect, it } from 'vitest';
import {
  appendBufferedOutput,
  buildShellOptions,
  clearBufferedOutput,
  getShellDisplayName,
  selectActiveTab,
  toShellOverride,
  type BufferedOutputState,
} from './helpers';
import '../../i18n';

function newBuffer(): BufferedOutputState {
  return { bufferedOutput: [], bufferedChars: 0 };
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

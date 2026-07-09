import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  isBookNotFoundError,
  extractBookPathFromError,
  loadLibrary,
  upsertLibraryEntry,
  removeLibraryEntry,
  getLastBookPath,
  setLastBookPath,
  clearLastBookPath,
} from './library';

// ============ Error parsing helpers (cross-FFI contract) ============
// These pin the string contract with `MoxiaManager::open_book` in
// src-tauri/src/moxia/mod.rs: `format!("file not found: {}", path)`.

describe('isBookNotFoundError', () => {
  it('matches the Rust "file not found: {path}" format', () => {
    expect(isBookNotFoundError('file not found: /a/b.moxia')).toBe(true);
  });

  it('matches with an empty path (Rust edge case)', () => {
    expect(isBookNotFoundError('file not found: ')).toBe(true);
  });

  it('does NOT match without the trailing space (tighter contract)', () => {
    // Rust always emits the space; a missing space signals a different error.
    expect(isBookNotFoundError('file not found:/a/b.moxia')).toBe(false);
  });

  it('rejects unrelated sqlite errors', () => {
    expect(isBookNotFoundError('open sqlite failed: disk I/O')).toBe(false);
  });

  it('rejects "book not opened" (wrong domain)', () => {
    expect(isBookNotFoundError('book not opened')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isBookNotFoundError('')).toBe(false);
  });

  it('rejects non-string values', () => {
    expect(isBookNotFoundError(undefined)).toBe(false);
    expect(isBookNotFoundError(null)).toBe(false);
    expect(isBookNotFoundError(123)).toBe(false);
    expect(isBookNotFoundError(new Error('file not found: /x'))).toBe(false);
  });

  it('is case-sensitive (matches Rust format! which is lowercase)', () => {
    expect(isBookNotFoundError('FILE NOT FOUND: /x')).toBe(false);
  });

  it('only matches at the start of the string (not substring)', () => {
    expect(isBookNotFoundError('prefix file not found: /x')).toBe(false);
  });
});

describe('extractBookPathFromError', () => {
  it('extracts a normal path', () => {
    expect(extractBookPathFromError('file not found: /a/b.moxia')).toBe('/a/b.moxia');
  });

  it('extracts a path with spaces and unicode', () => {
    expect(extractBookPathFromError('file not found: /path with spaces/我的书.moxia')).toBe(
      '/path with spaces/我的书.moxia',
    );
  });

  it('preserves trailing whitespace in the path (no trim)', () => {
    // macOS/Linux allow trailing-whitespace paths; trimming would break
    // matching against library/last-book entries.
    expect(extractBookPathFromError('file not found: /trailing ')).toBe('/trailing ');
  });

  it('strips only the single separator space, not extra leading spaces in the path', () => {
    // If the path itself starts with a space (legal), it is preserved.
    expect(extractBookPathFromError('file not found:  /double.moxia')).toBe(' /double.moxia');
  });

  it('returns null for non-file-not-found errors', () => {
    expect(extractBookPathFromError('open sqlite failed: x')).toBeNull();
    expect(extractBookPathFromError('book not opened')).toBeNull();
    expect(extractBookPathFromError('')).toBeNull();
    expect(extractBookPathFromError(undefined)).toBeNull();
    expect(extractBookPathFromError(123)).toBeNull();
  });

  it('handles a path that itself contains the prefix substring', () => {
    expect(extractBookPathFromError('file not found: /file not found: x.moxia')).toBe('/file not found: x.moxia');
  });
});

// ============ Library index (localStorage-backed) ============

describe('library index', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('loadLibrary', () => {
    it('returns [] when localStorage is empty', () => {
      expect(loadLibrary()).toEqual([]);
    });

    it('returns [] when the stored JSON is corrupt', () => {
      localStorage.setItem('moxia:library', '{not json');
      expect(loadLibrary()).toEqual([]);
    });

    it('returns [] when the stored JSON is not an array', () => {
      localStorage.setItem('moxia:library', '{}');
      expect(loadLibrary()).toEqual([]);
    });

    it('sorts entries by lastOpenedAt descending', () => {
      localStorage.setItem(
        'moxia:library',
        JSON.stringify([
          { path: '/old.moxia', title: 'Old', lastOpenedAt: '2026-01-01T00:00:00.000Z' },
          { path: '/new.moxia', title: 'New', lastOpenedAt: '2026-07-01T00:00:00.000Z' },
          { path: '/mid.moxia', title: 'Mid', lastOpenedAt: '2026-04-01T00:00:00.000Z' },
        ]),
      );
      const result = loadLibrary();
      expect(result.map((e) => e.path)).toEqual(['/new.moxia', '/mid.moxia', '/old.moxia']);
    });
  });

  describe('upsertLibraryEntry', () => {
    it('inserts a new entry', () => {
      upsertLibraryEntry('/a.moxia', 'A');
      const result = loadLibrary();
      expect(result).toHaveLength(1);
      expect(result[0].path).toBe('/a.moxia');
      expect(result[0].title).toBe('A');
    });

    it('dedupes by path and updates lastOpenedAt', () => {
      upsertLibraryEntry('/a.moxia', 'A1');
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-07-09T10:00:00.000Z'));
      upsertLibraryEntry('/a.moxia', 'A2');
      vi.useRealTimers();
      const result = loadLibrary();
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('A2');
    });
  });

  describe('removeLibraryEntry', () => {
    it('removes an existing entry', () => {
      upsertLibraryEntry('/a.moxia', 'A');
      upsertLibraryEntry('/b.moxia', 'B');
      removeLibraryEntry('/a.moxia');
      const result = loadLibrary();
      expect(result).toHaveLength(1);
      expect(result[0].path).toBe('/b.moxia');
    });

    it('is a no-op for an absent path (no throw)', () => {
      upsertLibraryEntry('/a.moxia', 'A');
      expect(() => removeLibraryEntry('/nonexistent.moxia')).not.toThrow();
      expect(loadLibrary()).toHaveLength(1);
    });
  });

  describe('last book path', () => {
    it('round-trips set/get/clear', () => {
      expect(getLastBookPath()).toBeNull();
      setLastBookPath('/x.moxia');
      expect(getLastBookPath()).toBe('/x.moxia');
      clearLastBookPath();
      expect(getLastBookPath()).toBeNull();
    });
  });
});

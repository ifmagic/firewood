import type { LibraryEntry } from './types';

const LIBRARY_KEY = 'moxia:library';
const LAST_BOOK_KEY = 'moxia:last-book';

/** Reads the library index (sorted by lastOpenedAt descending). */
export function loadLibrary(): LibraryEntry[] {
  try {
    const raw = localStorage.getItem(LIBRARY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LibraryEntry[];
    if (!Array.isArray(parsed)) return [];
    return [...parsed].sort((a, b) => b.lastOpenedAt.localeCompare(a.lastOpenedAt));
  } catch {
    return [];
  }
}

function saveLibrary(entries: LibraryEntry[]): void {
  try {
    localStorage.setItem(LIBRARY_KEY, JSON.stringify(entries));
  } catch {
    // ignore
  }
}

/** Inserts or updates an index entry (deduped by path, updates lastOpenedAt). */
export function upsertLibraryEntry(path: string, title: string): void {
  const entries = loadLibrary().filter((e) => e.path !== path);
  entries.push({ path, title, lastOpenedAt: new Date().toISOString() });
  saveLibrary(entries);
}

/** Removes an entry from the index. */
export function removeLibraryEntry(path: string): void {
  saveLibrary(loadLibrary().filter((e) => e.path !== path));
}

/** Persists the path of the last opened book. */
export function getLastBookPath(): string | null {
  try {
    return localStorage.getItem(LAST_BOOK_KEY);
  } catch {
    return null;
  }
}

export function setLastBookPath(path: string): void {
  try {
    localStorage.setItem(LAST_BOOK_KEY, path);
  } catch {
    // ignore
  }
}

export function clearLastBookPath(): void {
  try {
    localStorage.removeItem(LAST_BOOK_KEY);
  } catch {
    // ignore
  }
}

/**
 * The error prefix emitted by `MoxiaManager::open_book` in
 * `src-tauri/src/moxia/mod.rs` when the book file does not exist:
 * `format!("file not found: {}", path)`. This is a cross-FFI string contract —
 * if the Rust wording changes, update this constant and the matching test in
 * `library.test.ts`.
 */
const BOOK_NOT_FOUND_PREFIX = 'file not found: ';

/**
 * Detects whether an `openBook` failure is due to the file being missing
 * (deleted or moved). Expects the raw Tauri rejection string (not an
 * `Error.toString()` which would prefix with "Error: ").
 */
export function isBookNotFoundError(e: unknown): boolean {
  return typeof e === 'string' && e.startsWith(BOOK_NOT_FOUND_PREFIX);
}

/**
 * Extracts the book path from a `file not found: {path}` error string.
 * Returns null if the error is not a file-not-found error. The path is
 * returned verbatim (no trimming) so paths with trailing whitespace — legal
 * on macOS/Linux — still match library/last-book entries.
 */
export function extractBookPathFromError(e: unknown): string | null {
  if (!isBookNotFoundError(e)) return null;
  return (e as string).slice(BOOK_NOT_FOUND_PREFIX.length);
}

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

import { useEffect, useState } from 'react';

/**
 * localStorage-backed state. The optional `isValid` guard rejects stored
 * values that parse as valid JSON but have the wrong shape (e.g. "null" or
 * 0 for a boolean flag) — without it a tampered/legacy value flows through
 * unvalidated and gets re-persisted. Values that fail JSON.parse fall back
 * to `initialValue` regardless.
 */
export function usePersistentState<T>(key: string, initialValue: T, isValid?: (value: unknown) => value is T) {
  const [state, setState] = useState<T>(() => {
    try {
      const saved = localStorage.getItem(key);
      if (saved === null) return initialValue;
      const parsed: unknown = JSON.parse(saved);
      if (isValid && !isValid(parsed)) return initialValue;
      return parsed as T;
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {
      // Ignore storage failures and keep the in-memory state usable.
    }
  }, [key, state]);

  return [state, setState] as const;
}

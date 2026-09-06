import { useCallback, useEffect } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { usePersistentState } from './usePersistentState';

const STORAGE_KEY = 'firewood-always-on-top';

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

/**
 * Global window pin (always-on-top). The state persists across launches and
 * is re-applied to the native window on mount, so a relaunch keeps the
 * toolbox floating above other apps.
 */
export function useAlwaysOnTop() {
  const [pinned, setPinned] = usePersistentState(STORAGE_KEY, false, isBoolean);

  useEffect(() => {
    try {
      // getCurrentWindow throws outside the Tauri runtime (plain browser dev).
      void getCurrentWindow()
        .setAlwaysOnTop(pinned)
        .catch((err) => console.error('Failed to set always-on-top', err));
    } catch {
      // Not running inside Tauri — keep the toggle usable as UI state only.
    }
  }, [pinned]);

  const toggle = useCallback(() => {
    setPinned((prev) => !prev);
  }, [setPinned]);

  return { pinned, toggle };
}

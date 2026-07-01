import { useCallback } from 'react';
import { usePersistentState } from './usePersistentState';

const STORAGE_KEY = 'firewood:sidebar-collapsed';

export function useSidebarCollapsed() {
  const [collapsed, setCollapsed] = usePersistentState<boolean>(STORAGE_KEY, false);
  const toggle = useCallback(() => setCollapsed((prev) => !prev), [setCollapsed]);
  return { collapsed, toggle };
}

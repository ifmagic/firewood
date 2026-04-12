import { useState, useEffect, useCallback } from 'react';

const VISIBILITY_STORAGE_KEY = 'firewood:tool-visibility';

export function useToolVisibility(toolIds: string[]) {
  const [visibility, setVisibility] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem(VISIBILITY_STORAGE_KEY);
      const parsed = saved ? JSON.parse(saved) : {};
      // Ensure all tools have default values
      return toolIds.reduce(
        (acc, id) => {
          acc[id] = parsed[id] ?? true;
          return acc;
        },
        {} as Record<string, boolean>,
      );
    } catch {
      // Return all tools visible by default
      return toolIds.reduce(
        (acc, id) => {
          acc[id] = true;
          return acc;
        },
        {} as Record<string, boolean>,
      );
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(VISIBILITY_STORAGE_KEY, JSON.stringify(visibility));
    } catch {
      // Silently fail
    }
  }, [visibility]);

  const toggleToolVisibility = useCallback((toolId: string) => {
    setVisibility((prev) => ({
      ...prev,
      [toolId]: !prev[toolId],
    }));
  }, []);

  return { visibility, toggleToolVisibility };
}

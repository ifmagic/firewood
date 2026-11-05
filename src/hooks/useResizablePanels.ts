import { useState, useRef, useCallback } from 'react';

/**
 * Provides state and handlers for a horizontally draggable divider between two panels.
 * @param initialLeftPercent - initial width percentage of the left panel (default 50)
 * @param min - minimum left percent (default 20)
 * @param max - maximum left percent (default 80)
 */
export function useResizablePanels(initialLeftPercent = 50, min = 20, max = 80) {
  const [leftPercent, setLeftPercent] = useState(initialLeftPercent);
  const containerRef = useRef<HTMLDivElement>(null);

  const onDividerMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const container = containerRef.current;
      if (!container) return;

      const onMouseMove = (ev: MouseEvent) => {
        const rect = container.getBoundingClientRect();
        const ratio = ((ev.clientX - rect.left) / rect.width) * 100;
        setLeftPercent(Math.min(Math.max(ratio, min), max));
      };

      const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    },
    [min, max],
  );

  // Keyboard alternative: arrow keys nudge the split (shift = 5% step). Exposed
  // on the divider so users who cannot use the mouse can still resize panes.
  const onDividerKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;

      e.preventDefault();
      e.stopPropagation();
      const step = e.shiftKey ? 5 : 1;
      const dir = e.key === 'ArrowRight' ? 1 : -1;

      setLeftPercent((prev) => Math.min(max, Math.max(min, prev + dir * step)));
    },
    [min, max],
  );

  return {
    leftPercent,
    min,
    max,
    containerRef,
    onDividerMouseDown,
    onDividerKeyDown,
  };
}

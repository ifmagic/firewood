import { useEffect, useState } from 'react';

const STORAGE_KEY = 'firewood_editor_font_size';
const DEFAULT_SIZE = 17;
const MIN_SIZE = 10;
const MAX_SIZE = 32;

export function useEditorFontSize() {
  const [fontSize, setFontSize] = useState<number>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? Number(saved) : DEFAULT_SIZE;
  });

  // Persist in an effect, not inside the state updaters: React may invoke an
  // updater more than once (StrictMode), and side effects must not ride along.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(fontSize));
    } catch {
      // Private mode / quota — keep the in-memory state usable.
    }
  }, [fontSize]);

  const increase = () => setFontSize((s) => Math.min(s + 1, MAX_SIZE));

  const decrease = () => setFontSize((s) => Math.max(s - 1, MIN_SIZE));

  return { fontSize, increase, decrease };
}

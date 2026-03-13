import { useState } from 'react';

const STORAGE_KEY = 'firewood_editor_font_size';
const DEFAULT_SIZE = 15;
const MIN_SIZE = 10;
const MAX_SIZE = 28;

export function useEditorFontSize() {
  const [fontSize, setFontSize] = useState<number>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? Number(saved) : DEFAULT_SIZE;
  });

  const increase = () =>
    setFontSize((s) => {
      const next = Math.min(s + 1, MAX_SIZE);
      localStorage.setItem(STORAGE_KEY, String(next));
      return next;
    });

  const decrease = () =>
    setFontSize((s) => {
      const next = Math.max(s - 1, MIN_SIZE);
      localStorage.setItem(STORAGE_KEY, String(next));
      return next;
    });

  return { fontSize, increase, decrease };
}

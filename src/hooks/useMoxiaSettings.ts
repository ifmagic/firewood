import { useCallback, useState } from 'react';

const WIDTH_KEY = 'moxia_content_max_width';
const DEFAULT_WIDTH = 820;
const MIN_WIDTH = 600;
const MAX_WIDTH = 1400;
const STEP = 20;

function readWidth(): number {
  try {
    const saved = localStorage.getItem(WIDTH_KEY);
    if (!saved) return DEFAULT_WIDTH;
    const n = Number(saved);
    if (!Number.isFinite(n)) return DEFAULT_WIDTH;
    return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(n)));
  } catch {
    return DEFAULT_WIDTH;
  }
}

function writeWidth(n: number) {
  try {
    localStorage.setItem(WIDTH_KEY, String(n));
  } catch {
    // ignore
  }
}

/**
 * moxia 内容区最大宽度 hook。沿用原 moxia 项目的 contentMaxWidth 600–1400 设置。
 * 用于章节正文居中容器的 max-width，让长行不会过宽影响阅读。
 */
export function useMoxiaSettings() {
  const [contentMaxWidth, setContentMaxWidthState] = useState<number>(readWidth);

  const setContentMaxWidth = useCallback((value: number) => {
    const clamped = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(value / STEP) * STEP));
    writeWidth(clamped);
    setContentMaxWidthState(clamped);
  }, []);

  return {
    contentMaxWidth,
    setContentMaxWidth,
    widthMin: MIN_WIDTH,
    widthMax: MAX_WIDTH,
    widthStep: STEP,
  };
}

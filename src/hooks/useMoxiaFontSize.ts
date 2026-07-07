import { useCallback, useState } from 'react';

const STORAGE_KEY = 'moxia_editor_font_size';
const DEFAULT_SIZE = 17;
const MIN_SIZE = 12;
const MAX_SIZE = 24;

function readStored(): number {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return DEFAULT_SIZE;
    const n = Number(saved);
    if (!Number.isFinite(n)) return DEFAULT_SIZE;
    // 旧数据可能越界，clamp 一道
    return Math.min(MAX_SIZE, Math.max(MIN_SIZE, Math.round(n)));
  } catch {
    return DEFAULT_SIZE;
  }
}

function writeStored(n: number) {
  try {
    localStorage.setItem(STORAGE_KEY, String(n));
  } catch {
    // 私有模式 / quota 超限，忽略；内存状态仍可用
  }
}

/**
 * moxia 独立编辑器字号 hook。
 *
 * 与 firewood 全局 useEditorFontSize 隔离（key 不同、范围不同），
 * 沿用原 moxia 项目的 editorFontSize 12–24 设置。
 * 持久化在 localStorage，跨会话保留；与单本书的 .moxia 文件无关
 * （字号是 UI 偏好，不是书数据，不进 sqlite）。
 */
export function useMoxiaFontSize() {
  const [fontSize, setFontSize] = useState<number>(readStored);

  const increase = useCallback(() => {
    setFontSize((s) => {
      const next = Math.min(s + 1, MAX_SIZE);
      writeStored(next);
      return next;
    });
  }, []);

  const decrease = useCallback(() => {
    setFontSize((s) => {
      const next = Math.max(s - 1, MIN_SIZE);
      writeStored(next);
      return next;
    });
  }, []);

  // 直接设定（用于 settings 面板的 Slider/NumberInput）
  const setClamped = useCallback((n: number) => {
    const next = Math.min(MAX_SIZE, Math.max(MIN_SIZE, Math.round(n)));
    writeStored(next);
    setFontSize(next);
  }, []);

  return {
    fontSize,
    increase,
    decrease,
    setFontSize: setClamped,
    min: MIN_SIZE,
    max: MAX_SIZE,
  };
}

import { useEffect, useState } from 'react';
import type { Appearance } from '../theme/palette';

function currentAppearance(): Appearance {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'light';
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * Browser-level appearance, used only for values JavaScript must materialize
 * (the Ant Design algorithm, CodeMirror highlight colors and the xterm theme).
 * All CSS-driven surfaces follow the same media query in src/index.css, so the
 * app never offers its own appearance switch — it simply respects the system
 * setting (see DESIGN.md).
 */
export function useSystemAppearance(): Appearance {
  const [appearance, setAppearance] = useState<Appearance>(currentAppearance);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const sync = () => setAppearance(media.matches ? 'dark' : 'light');

    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  return appearance;
}

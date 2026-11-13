import type { ThemeConfig } from 'antd';

/**
 * Single source of truth for the Ant Design theme tokens.
 *
 * The CSS token layer in src/index.css owns everything that can be expressed
 * as a custom property; Ant Design additionally derives hover/active steps in
 * JavaScript, so it needs concrete hex values instead of var(). Both halves
 * are defined here once and consumed by App.tsx. Keep the two in sync: a new
 * semantic color gets a CSS variable in index.css *and* an antd token here.
 *
 * Appearance follows the system (prefers-color-scheme) — there is deliberately
 * no in-app switch (see AGENTS.md / DESIGN.md).
 */
export type Appearance = 'light' | 'dark';

interface Palette {
  action: string;
  link: string;
  linkHover: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  textQuaternary: string;
  border: string;
  borderSecondary: string;
  bgContainer: string;
  bgElevated: string;
  bgLayout: string;
  fillAlter: string;
  fillSecondary: string;
  itemActive: string;
  itemActiveHover: string;
  outline: string;
  shadowSecondary: string;
}

export const LIGHT_PALETTE: Palette = {
  action: '#c2410c',
  link: '#b54708',
  linkHover: '#c2410c',
  text: '#2a241e',
  textSecondary: '#5f574d',
  // 5.43:1 on #faf9f6 — the previous #7d7365 was 4.42:1, below AA for the
  // 11–12px labels that actually use it.
  textTertiary: '#6f6557',
  textQuaternary: '#8a8072',
  border: '#d9d2c5',
  borderSecondary: '#e9e4da',
  bgContainer: '#fffefb',
  bgElevated: '#fffefb',
  bgLayout: '#faf9f6',
  fillAlter: '#f6f4ee',
  fillSecondary: '#f1eee6',
  itemActive: '#fdeee2',
  itemActiveHover: '#fadcc6',
  outline: 'rgba(232, 89, 12, 0.18)',
  shadowSecondary: '0 12px 32px rgba(46, 36, 25, 0.1)',
};

export const DARK_PALETTE: Palette = {
  // The action tone stays the same: white on #c2410c is 5.18:1 in both
  // appearances, while the brighter display accent would drop below AA.
  action: '#c2410c',
  link: '#f5b36b',
  linkHover: '#ffb27a',
  text: '#f5f0e8',
  textSecondary: '#d6cdbf',
  textTertiary: '#9c9181',
  textQuaternary: '#8f8577',
  border: '#4d453a',
  borderSecondary: '#3a332b',
  bgContainer: '#26211b',
  bgElevated: '#2b251f',
  bgLayout: '#1d1915',
  fillAlter: '#26211b',
  fillSecondary: '#2a241d',
  itemActive: 'rgba(232, 89, 12, 0.18)',
  itemActiveHover: 'rgba(232, 89, 12, 0.26)',
  outline: 'rgba(232, 89, 12, 0.32)',
  shadowSecondary: '0 12px 32px rgba(0, 0, 0, 0.5)',
};

export function paletteFor(appearance: Appearance): Palette {
  return appearance === 'dark' ? DARK_PALETTE : LIGHT_PALETTE;
}

/** Ant Design theme config for the current system appearance. */
export function antdThemeFor(appearance: Appearance, algorithm: ThemeConfig['algorithm']): ThemeConfig {
  const palette = paletteFor(appearance);

  return {
    algorithm,
    token: {
      colorPrimary: palette.action,
      colorInfo: palette.action,
      // Links are small text on the content surface: the vivid accent only
      // reaches ~3.4:1, so link text uses the darker accent ink.
      colorLink: palette.link,
      colorLinkHover: palette.linkHover,
      colorText: palette.text,
      colorTextSecondary: palette.textSecondary,
      colorTextTertiary: palette.textTertiary,
      colorTextQuaternary: palette.textQuaternary,
      colorBorder: palette.border,
      colorBorderSecondary: palette.borderSecondary,
      colorBgContainer: palette.bgContainer,
      colorBgElevated: palette.bgElevated,
      colorBgLayout: palette.bgLayout,
      colorFillAlter: palette.fillAlter,
      colorFillSecondary: palette.fillSecondary,
      controlItemBgActive: palette.itemActive,
      controlItemBgActiveHover: palette.itemActiveHover,
      controlOutline: palette.outline,
      boxShadowSecondary: palette.shadowSecondary,
      borderRadius: 8,
      fontSize: 14,
      lineWidth: 1,
    },
  };
}

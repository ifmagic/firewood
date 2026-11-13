import { describe, expect, it } from 'vitest';
import { DARK_PALETTE, LIGHT_PALETTE, paletteFor } from './palette';

/** WCAG relative luminance for a #rrggbb color. */
function luminance(hex: string): number {
  const [r, g, b] = hex
    .replace('#', '')
    .match(/\w\w/g)!
    .map((part) => Number.parseInt(part, 16) / 255)
    .map((channel) => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(foreground: string, background: string): number {
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/**
 * Locks the two accessibility guarantees the design system makes:
 * - every text tone used for labels reaches 4.5:1 on its own surface;
 * - white text on the action tone reaches 4.5:1 in both appearances.
 * The old light tertiary (#7d7365) was 4.42:1 — this test is why it moved.
 */
describe('theme palette contrast', () => {
  it.each([LIGHT_PALETTE, DARK_PALETTE])('keeps body and tertiary text at AA (%o)', (palette) => {
    expect(contrast(palette.text, palette.bgLayout)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(palette.textSecondary, palette.bgLayout)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(palette.textTertiary, palette.bgLayout)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(palette.text, palette.bgContainer)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(palette.textTertiary, palette.bgContainer)).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#ffffff', palette.action)).toBeGreaterThanOrEqual(4.5);
  });

  it('resolves by appearance', () => {
    expect(paletteFor('light')).toBe(LIGHT_PALETTE);
    expect(paletteFor('dark')).toBe(DARK_PALETTE);
  });
});

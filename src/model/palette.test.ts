import { expect, test } from 'vitest';
import { colorVar, onColorVar, PALETTE } from './palette';

test('eight distinct opaque track colours, each with a pitch, as CSS variables', () => {
  expect(PALETTE).toHaveLength(8);
  expect(new Set(PALETTE.map((p) => p.color)).size).toBe(8);
  expect(PALETTE.every((p) => /^#[0-9A-F]{6}$/.test(p.color))).toBe(true);
  expect(colorVar(0)).toBe('var(--track-blue)');
  expect(colorVar(9)).toBe('var(--track-yellow)'); // wraps
});

/** WCAG relative luminance and contrast ratio, from #RRGGBB. */
const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

test("words on a line's colour are whichever of ink and white reads better, at 4.5:1 or more", () => {
  for (const { color, on } of PALETTE) {
    expect(['#111111', '#FFFFFF']).toContain(on);
    const other = on === '#111111' ? '#FFFFFF' : '#111111';
    expect(contrast(color, on)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(color, on)).toBeGreaterThan(contrast(color, other));
  }
  // Yellow takes ink, as the N, Q, R and W bullets do; blue takes white.
  expect(PALETTE[1].on).toBe('#111111');
  expect(PALETTE[0].on).toBe('#FFFFFF');
  expect(onColorVar(0)).toBe('var(--track-blue-on)');
  expect(onColorVar(9)).toBe('var(--track-yellow-on)'); // wraps
});

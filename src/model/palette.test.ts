import { expect, test } from 'vitest';
import { colorVar, fillVar, INK, onColorVar, PALETTE } from './palette';

test("a fill is the line's own colour, or a shade of it a few steps darker", () => {
  for (const { color, fill } of PALETTE) {
    const step = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16) - parseInt(fill.slice(i, i + 2), 16));
    expect(step.every((d) => d >= 0 && d <= 12)).toBe(true);
  }
});

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

test("words on a line's fill are whichever of ink and white reads better, at 4.5:1 or more", () => {
  for (const { fill, on } of PALETTE) {
    expect([INK, '#FFFFFF']).toContain(on);
    const other = on === INK ? '#FFFFFF' : INK;
    expect(contrast(fill, on)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(fill, on)).toBeGreaterThan(contrast(fill, other));
  }
  // Yellow takes ink, as the N, Q, R and W bullets do; red takes white, as the 1, 2 and 3 do.
  expect(PALETTE[1].on).toBe(INK);
  expect(PALETTE[3].on).toBe('#FFFFFF');
  expect(fillVar(0)).toBe('var(--track-blue-fill)');
  expect(onColorVar(0)).toBe('var(--track-blue-on)');
  expect(onColorVar(9)).toBe('var(--track-yellow-on)'); // wraps
});

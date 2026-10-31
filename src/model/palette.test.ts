import { expect, test } from 'vitest';
import { colorVar, PALETTE } from './palette';

test('eight distinct opaque track colours, each with a pitch, as CSS variables', () => {
  expect(PALETTE).toHaveLength(8);
  expect(new Set(PALETTE.map((p) => p.color)).size).toBe(8);
  expect(PALETTE.every((p) => /^#[0-9A-F]{6}$/.test(p.color))).toBe(true);
  expect(colorVar(0)).toBe('var(--track-blue)');
  expect(colorVar(9)).toBe('var(--track-ochre)'); // wraps
});

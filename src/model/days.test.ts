import { expect, test } from 'vitest';
import { dayOf } from './days';

test('a day runs from four in the morning', () => {
  const at = (y: number, m: number, d: number, h: number, min = 0) => new Date(y, m - 1, d, h, min).getTime();
  expect(dayOf(at(2026, 11, 1, 12))).toBe('2026-11-01');
  expect(dayOf(at(2026, 11, 2, 3, 59))).toBe('2026-11-01');
  expect(dayOf(at(2026, 11, 2, 4))).toBe('2026-11-02');
  expect(dayOf(at(2026, 1, 1, 0, 30))).toBe('2025-12-31');
});

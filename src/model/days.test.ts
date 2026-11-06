import { expect, test } from 'vitest';
import { addDays, dayOf, nextMidnight, startOfDate } from './days';

const at = (y: number, m: number, d: number, h: number, min = 0) => new Date(y, m - 1, d, h, min).getTime();

test('a day runs from midnight to midnight', () => {
  expect(dayOf(at(2026, 11, 1, 12))).toBe('2026-11-01');
  expect(dayOf(at(2026, 11, 1, 23, 59))).toBe('2026-11-01');
  expect(dayOf(at(2026, 11, 2, 0))).toBe('2026-11-02');
  expect(dayOf(at(2026, 1, 1, 0, 30))).toBe('2026-01-01');
});

test('a date starts at its local midnight, and the next midnight follows any moment', () => {
  expect(startOfDate('2026-11-07')).toBe(at(2026, 11, 7, 0));
  expect(nextMidnight(at(2026, 11, 6, 23, 30))).toBe(at(2026, 11, 7, 0));
  expect(nextMidnight(at(2026, 11, 7, 0))).toBe(at(2026, 11, 8, 0));
});

test('days are added across months and years', () => {
  expect(addDays('2026-11-06', 1)).toBe('2026-11-07');
  expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
  expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  expect(addDays('2026-11-02', -1)).toBe('2026-11-01');
});

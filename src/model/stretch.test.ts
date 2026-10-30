import { expect, test } from 'vitest';
import { defaultName, isOver, remaining } from './stretch';
import type { Stretch } from './types';

test('the name follows the hour', () => {
  expect(defaultName(0)).toBe('Morning');
  expect(defaultName(6)).toBe('Morning');
  expect(defaultName(11)).toBe('Morning');
  expect(defaultName(12)).toBe('Afternoon');
  expect(defaultName(17)).toBe('Afternoon');
  expect(defaultName(18)).toBe('Evening');
  expect(defaultName(23)).toBe('Evening');
});

const st: Stretch = { kind: 'deep', length: 'couple', name: 'Afternoon', startedAt: 1_000_000, line: [] };
const MINUTE = 60_000;

test('remaining is read from the clock, not counted', () => {
  expect(remaining(st, 1_000_000)).toBe(1);
  expect(remaining(st, 1_000_000 + 60 * MINUTE)).toBe(0.5);
  expect(remaining(st, 1_000_000 + 10 * 60 * MINUTE)).toBe(0);
  expect(isOver(st, 1_000_000 + 120 * MINUTE)).toBe(true);
  expect(isOver(st, 1_000_000 + 119 * MINUTE)).toBe(false);
});

test('a clock set back never gives more than the whole stretch', () => {
  expect(remaining(st, 1_000_000 - 5 * MINUTE)).toBe(1);
});

import { expect, test } from 'vitest';
import { capacity, LENGTH_MINUTES, SHAPE_MINUTES } from './sizes';

test('capacity is 80 percent of the declared length', () => {
  expect(capacity('hour')).toBe(48);
  expect(capacity('couple')).toBe(96);
  expect(capacity('half')).toBe(192);
  expect(capacity('whole')).toBe(384);
});

test('shapes and lengths carry the spec minutes', () => {
  expect(SHAPE_MINUTES).toEqual({ circle: 20, triangle: 45, square: 90 });
  expect(LENGTH_MINUTES).toEqual({ hour: 60, couple: 120, half: 240, whole: 480 });
});

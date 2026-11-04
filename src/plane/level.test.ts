import { expect, test } from 'vitest';
import { DAY, HOUR, MINUTE, WEEK } from './grid';
import { showsAt } from './level';

test('a square and a large triangle show at every grid unit', () => {
  expect(showsAt('square', 'small', 30 * DAY)).toBe(true);
  expect(showsAt('triangle', 'large', 30 * DAY)).toBe(true);
});

test('each shape and size has a grid unit at or below which it shows', () => {
  expect(showsAt('triangle', 'medium', WEEK)).toBe(true);
  expect(showsAt('triangle', 'medium', 30 * DAY)).toBe(false);
  expect(showsAt('triangle', 'small', DAY)).toBe(true);
  expect(showsAt('triangle', 'small', WEEK)).toBe(false);
  expect(showsAt('circle', 'large', 6 * HOUR)).toBe(true);
  expect(showsAt('circle', 'large', DAY)).toBe(false);
  expect(showsAt('circle', 'medium', HOUR)).toBe(true);
  expect(showsAt('circle', 'medium', 6 * HOUR)).toBe(false);
  expect(showsAt('circle', 'small', 15 * MINUTE)).toBe(true);
  expect(showsAt('circle', 'small', HOUR)).toBe(false);
});

test('zooming in past a shape\'s unit keeps it shown', () => {
  expect(showsAt('circle', 'small', 1)).toBe(true);
  expect(showsAt('triangle', 'medium', 5)).toBe(true);
});

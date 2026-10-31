import { expect, test } from 'vitest';
import { placeClear } from './placement';

test('a new station lands at the center, or a radius to the right at a time until clear', () => {
  expect(placeClear({ x: 0, y: 0 }, [], 48)).toEqual({ x: 0, y: 0 });
  expect(placeClear({ x: 0, y: 0 }, [{ x: 10, y: 0 }], 48)).toEqual({ x: 96, y: 0 });
  expect(placeClear({ x: 0, y: 0 }, [{ x: 10, y: 0 }, { x: 60, y: 0 }], 48)).toEqual({ x: 144, y: 0 });
  expect(placeClear({ x: 0, y: 0 }, [{ x: 10, y: 0 }], 5000)).toEqual({ x: 10000, y: 0 });
});

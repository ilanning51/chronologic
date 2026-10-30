import { expect, test } from 'vitest';
import { CLEAR_RADIUS, placeClear } from './placement';

test('placeClear nudges right until clear', () => {
  expect(CLEAR_RADIUS).toBe(48);
  expect(placeClear({ x: 0, y: 0 }, [])).toEqual({ x: 0, y: 0 });
  expect(placeClear({ x: 0, y: 0 }, [{ x: 0, y: 0 }])).toEqual({ x: 48, y: 0 });
  expect(placeClear({ x: 0, y: 0 }, [{ x: 0, y: 0 }, { x: 48, y: 0 }])).toEqual({ x: 96, y: 0 });
});

test('a near miss still counts as taken, so the nudge keeps going', () => {
  expect(placeClear({ x: 0, y: 0 }, [{ x: 10, y: 10 }])).toEqual({ x: 96, y: 0 });
});

test('a station exactly a radius away is clear', () => {
  expect(placeClear({ x: 0, y: 0 }, [{ x: 48, y: 0 }])).toEqual({ x: 0, y: 0 });
});

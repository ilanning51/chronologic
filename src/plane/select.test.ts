import { expect, test } from 'vitest';
import { twoLines } from '../test/fixtures';
import { bounds, pick, prune, rectOf } from './select';

test('rectOf takes any two corners', () => {
  expect(rectOf({ x: 10, y: 20 }, { x: 0, y: 5 })).toEqual({ x: 0, y: 5, w: 10, h: 15 });
});

test('pick takes the stops and origins inside, edges included, drawn or not', () => {
  const world = twoLines();
  expect(pick(world, { x: 0, y: 0, w: 1500, h: 600 })).toEqual({ stops: ['dentist', 'shared'], origins: ['t1', 't2'] });
  expect(pick(world, { x: 2900, y: -10, w: 200, h: 20 })).toEqual({ stops: ['wristband'], origins: [] });
  expect(pick(world, { x: 5000, y: 5000, w: 10, h: 10 })).toBeNull();
});

test('bounds wrap what is still in the world, and prune drops what is not', () => {
  const world = twoLines();
  const s = { stops: ['dentist', 'goal2', 'gone'], origins: ['t2', 'gone'] };
  expect(bounds(world, s)).toEqual({ x: 0, y: 0, w: 3000, h: 600 });
  expect(prune(world, s)).toEqual({ stops: ['dentist', 'goal2'], origins: ['t2'] });
  expect(bounds(world, { stops: ['gone'], origins: [] })).toBeNull();
  expect(prune(world, { stops: ['gone'], origins: [] })).toBeNull();
});

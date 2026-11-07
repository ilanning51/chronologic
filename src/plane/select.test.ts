import { expect, test } from 'vitest';
import { twoLines, withLife, withWeek } from '../test/fixtures';
import { bounds, pick, prune, rectOf } from './select';

test('rectOf takes any two corners', () => {
  expect(rectOf({ x: 10, y: 20 }, { x: 0, y: 5 })).toEqual({ x: 0, y: 5, w: 10, h: 15 });
});

test('pick takes the stops and origins inside, edges included, drawn or not', () => {
  const world = twoLines();
  expect(pick(world, { x: 0, y: 0, w: 1500, h: 600 }, '2026-11-01')).toEqual({ stops: ['dentist', 'shared'], origins: ['t1', 't2'] });
  expect(pick(world, { x: 2900, y: -10, w: 200, h: 20 }, '2026-11-01')).toEqual({ stops: ['wristband'], origins: [] });
  expect(pick(world, { x: 5000, y: 5000, w: 10, h: 10 }, '2026-11-01')).toBeNull();
});

test('bounds wrap what is still in the world, and prune drops what is not', () => {
  const world = twoLines();
  const s = { stops: ['dentist', 'goal2', 'gone'], origins: ['t2', 'gone'] };
  expect(bounds(world, s)).toEqual({ x: 0, y: 0, w: 3000, h: 600 });
  expect(prune(world, s)).toEqual({ stops: ['dentist', 'goal2'], origins: ['t2'] });
  expect(bounds(world, { stops: ['gone'], origins: [] })).toBeNull();
  expect(prune(world, { stops: ['gone'], origins: [] })).toBeNull();
});

test('a box over the start or the end square of a day line not drawn on the plane picks nothing', () => {
  const w = withWeek('2026-11-01');
  // Tomorrow's line is drawn: its start is picked.
  expect(pick(w, { x: 2990, y: 190, w: 20, h: 20 }, '2026-11-01')).toEqual({ stops: [], origins: ['day2'] });
  // Two days on, it is not.
  w.tracks.find((t) => t.id === 'day2')!.day!.date = '2026-11-03';
  expect(pick(w, { x: 2990, y: 190, w: 20, h: 20 }, '2026-11-01')).toBeNull();
  expect(pick(w, { x: 2990, y: 890, w: 20, h: 20 }, '2026-11-01')).toBeNull();
});

test('a box over the life line carries its squares but never its start', () => {
  const w = withLife();
  expect(pick(w, { x: -10, y: -810, w: 620, h: 20 }, '2026-11-01')).toEqual({ stops: ['start'], origins: [] });
  expect(pick(w, { x: -10, y: -810, w: 20, h: 20 }, '2026-11-01')).toBeNull();
});

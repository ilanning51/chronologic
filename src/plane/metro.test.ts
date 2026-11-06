import { expect, test } from 'vitest';
import type { Stop, Track, World } from '../model/types';
import { chooseBends, routesOf } from './metro';
import { legSpan, pathLength } from './routing';

const stop = (id: string, x: number, y: number): Stop => ({ id, title: id, shape: 'circle', size: 'small', x, y, done: false });
const track = (id: string, origin: { x: number; y: number }, stops: string[]): Track => ({
  id,
  color: 0,
  origin,
  stops,
  train: { leg: 0, departedAt: 0 },
  target: 'goal',
});
const world = (tracks: Track[], stops: Stop[]): World => ({ tracks, stops, lastTouched: null });
const xy = (points: { x: number; y: number }[]) => points.map(({ x, y }) => ({ x, y }));

test('a leg with nothing in its way keeps its diagonal first', () => {
  const w = world([track('a', { x: 0, y: 0 }, ['p'])], [stop('p', 100, 30)]);
  expect(chooseBends(w).get('a')).toEqual(['diagonal-first']);
  expect(xy(routesOf(w).get('a')!.vertices)).toEqual([{ x: 0, y: 0 }, { x: 30, y: 30 }, { x: 100, y: 30 }]);
});

test('a leg moves its bend to the far end rather than cross another line, at the same length', () => {
  // The vertical line at x 15 crosses the diagonal from the origin, but not the straight run along y 0.
  const w = world(
    [track('a', { x: 0, y: 0 }, ['p']), track('b', { x: 15, y: 10 }, ['q'])],
    [stop('p', 100, 30), stop('q', 15, 100)],
  );
  expect(chooseBends(w).get('a')).toEqual(['straight-first']);
  const route = routesOf(w).get('a')!;
  expect(xy(route.vertices)).toEqual([{ x: 0, y: 0 }, { x: 70, y: 0 }, { x: 100, y: 30 }]);
  const { from, to } = legSpan(route, 0);
  expect(pathLength(route.vertices, from, to)).toBeCloseTo(30 * Math.SQRT2 + 70);
});

test('a leg does not run through a stop it does not serve', () => {
  // Line c ends at s, which sits on a's straight run if a bends first; it runs along that run, so it never crosses it.
  const w = world(
    [track('a', { x: 0, y: 0 }, ['p']), track('c', { x: 200, y: 30 }, ['s'])],
    [stop('p', 100, 30), stop('s', 50, 30)],
  );
  expect(chooseBends(w).get('a')).toEqual(['straight-first']);
});

test('two lines between the same two stops bend together', () => {
  const w = world(
    [
      track('a', { x: 0, y: 0 }, ['p', 'q']),
      track('b', { x: 0, y: 60 }, ['p', 'q']),
      track('c', { x: 115, y: 10 }, ['r']),
    ],
    [stop('p', 100, 0), stop('q', 200, 30), stop('r', 115, 100)],
  );
  const bends = chooseBends(w);
  expect(bends.get('a')![1]).toBe('straight-first');
  expect(bends.get('b')![1]).toBe('straight-first');
});

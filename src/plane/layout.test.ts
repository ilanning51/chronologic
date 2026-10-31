import { expect, test } from 'vitest';
import type { Stop, Track } from '../model/types';
import { MAX_SCALE } from './camera';
import { layoutTrack } from './layout';

function stop(id: string, x: number, y: number, over: Partial<Stop> = {}): Stop {
  return { id, title: id, shape: 'circle', size: 'medium', x, y, done: false, ...over };
}
function trackOf(ids: string[], leg = 0): Track {
  return { id: 't', color: 2, origin: { x: 0, y: 0 }, stops: ids, train: { leg, departedAt: 0 }, target: 'next' };
}
const viewport = { w: 1000, h: 800 };

test('a track lays out in screen space with constant shapes, a dot for done, and the train on the path', () => {
  const a = stop('a', 1000, 0);
  const g = stop('g', 1000, 2000, { shape: 'square', size: 'large', done: true });
  const byId = new Map([a, g].map((s) => [s.id, s]));
  const camera = { x: 100, y: 100, scale: 0.1 };
  const v = layoutTrack(trackOf(['a', 'g']), byId, camera, 500_000, viewport);

  expect(v.id).toBe('t');
  expect(v.color).toBe(2);
  expect(v.finished).toBe(false);
  expect(v.anyInView).toBe(true);
  // origin (100,100) -> a (200,100) -> g (200,300): the route is axis-aligned here.
  expect(v.segments).toEqual([
    [{ x: 100, y: 100 }, { x: 200, y: 100 }],
    [{ x: 200, y: 100 }, { x: 200, y: 300 }],
  ]);
  expect(v.stops).toEqual([
    { id: 'a', x: 200, y: 100, shape: 'circle', size: 'medium', done: false, title: 'a', label: true, next: true, goal: false },
    { id: 'g', x: 200, y: 300, shape: 'square', size: 'large', done: true, title: 'g', label: true, next: false, goal: true },
  ]);
  // halfway through leg 0 (1000 s): world (500, 0) -> screen (150, 100).
  expect(v.train).toMatchObject({ x: 150, y: 100, waiting: false, parked: false });
  expect(v.train.angle).toBeCloseTo(0);
});

test('nothing off screen reaches the view and no NaN is produced at max zoom with a month of track', () => {
  const month = 2_592_000;
  const near = stop('near', 10, 0);
  const far = stop('far', 1_000_000, 0);
  const goal = stop('goal', month, 0);
  const byId = new Map([near, far, goal].map((s) => [s.id, s]));
  const camera = { x: 0, y: 0, scale: MAX_SCALE };
  const v = layoutTrack(trackOf(['near', 'far', 'goal']), byId, camera, 0, viewport);

  const inGrown = (p: { x: number; y: number }) =>
    Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= -200 && p.x <= 1200 && p.y >= -200 && p.y <= 1000;
  expect(v.segments.length).toBeGreaterThan(0);
  for (const [p, q] of v.segments) {
    expect(inGrown(p)).toBe(true);
    expect(inGrown(q)).toBe(true);
  }
  expect(v.stops.map((s) => s.id)).toEqual(['near']);
  expect(v.stops.every(inGrown)).toBe(true);
  expect(Number.isFinite(v.train.x)).toBe(true);
  expect(v.anyInView).toBe(true);
});

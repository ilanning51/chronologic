import { expect, test } from 'vitest';
import { dayState, trainState } from '../model/train';
import type { Stop, Track, World } from '../model/types';
import { running, twoLines, withDay } from '../test/fixtures';
import { MAX_SCALE, worldToScreen } from './camera';
import { layoutTrack } from './layout';

function stop(id: string, x: number, y: number, over: Partial<Stop> = {}): Stop {
  return { id, title: id, shape: 'circle', size: 'medium', x, y, done: false, ...over };
}
function trackOf(ids: string[], leg = 0): Track {
  return { id: 't', color: 2, origin: { x: 0, y: 0 }, stops: ids, train: { leg, departedAt: 0 }, target: 'next' };
}
function worldOf(track: Track, stops: Stop[]): World {
  return { tracks: [track], stops, lastTouched: null };
}
const viewport = { w: 1000, h: 800 };

test('a track lays out in screen space with constant shapes, a dot for done, and the train on the path', () => {
  const a = stop('a', 1000, 0);
  const g = stop('g', 1000, 2000, { shape: 'square', size: 'large', done: true });
  const camera = { x: 100, y: 100, scale: 0.1 };
  const track = trackOf(['a', 'g']);
  const v = layoutTrack(track, worldOf(track, [a, g]), camera, 500_000, viewport);

  expect(v.id).toBe('t');
  expect(v.color).toBe(2);
  expect(v.finished).toBe(false);
  expect(v.day).toBe(false);
  expect(v.sketch).toBe(false);
  expect(v.anyInView).toBe(true);
  // origin (100,100) -> a (200,100) -> g (200,300): the route is axis-aligned here.
  expect(v.segments).toEqual([
    [{ x: 100, y: 100 }, { x: 200, y: 100 }],
    [{ x: 200, y: 100 }, { x: 200, y: 300 }],
  ]);
  expect(v.stops).toEqual([
    { id: 'a', x: 200, y: 100, shape: 'circle', size: 'medium', done: false, title: 'a', label: true, next: true, goal: false, ring: false, crowd: 0 },
    { id: 'g', x: 200, y: 300, shape: 'square', size: 'large', done: true, title: 'g', label: true, next: false, goal: true, ring: false, crowd: 0 },
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
  const camera = { x: 0, y: 0, scale: MAX_SCALE };
  const track = trackOf(['near', 'far', 'goal']);
  const v = layoutTrack(track, worldOf(track, [near, far, goal]), camera, 0, viewport);

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

// Everything in the fixtures fits on screen at this scale.
const wide = { x: 100, y: 100, scale: 0.1 };
const s = 1000;
const ringOf = (v: ReturnType<typeof layoutTrack>, id: string) => v.stops.find((x) => x.id === id)!.ring;

test('a stop on two lines is a ring, and a done one is a dot', () => {
  const w = twoLines();
  const t1 = layoutTrack(w.tracks[0], w, wide, 0, viewport);
  const t2 = layoutTrack(w.tracks[1], w, wide, 0, viewport);
  expect(ringOf(t1, 'shared')).toBe(true);
  expect(ringOf(t2, 'shared')).toBe(true);
  expect(ringOf(t1, 'dentist')).toBe(false);
  expect(ringOf(t2, 'goal2')).toBe(false);

  w.stops.find((x) => x.id === 'shared')!.done = true;
  expect(ringOf(layoutTrack(w.tracks[0], w, wide, 0, viewport), 'shared')).toBe(false);

  // The day line counts as a line: Dentist is a ring once a day goes through it.
  const d = withDay();
  expect(ringOf(layoutTrack(d.tracks[0], d, wide, 0, viewport), 'dentist')).toBe(true);
});

test('a goal-only line is a sketch, and the day line never is', () => {
  const w = running();
  w.tracks[0].stops = ['wristband'];
  expect(layoutTrack(w.tracks[0], w, wide, 0, viewport).sketch).toBe(true);

  const d = withDay();
  const day = d.tracks.find((t) => t.day)!;
  day.stops = ['dayEnd'];
  const v = layoutTrack(day, d, wide, 0, viewport);
  expect(v.day).toBe(true);
  expect(v.sketch).toBe(false);
  expect(layoutTrack(d.tracks[0], d, wide, 0, viewport)).toMatchObject({ day: false, sketch: false });
});

test('the day line lays out its train by the shadow rule', () => {
  // At 500 s t1 is halfway to Dentist in time, so the day train is halfway down its 400 s leg.
  // Its own stored clock (departed at 0) would have it waiting at Dentist already.
  const w = withDay();
  const day = w.tracks.find((t) => t.day)!;
  const shadow = dayState(day, w, 500 * s);
  const own = trainState(day, new Map(w.stops.map((x) => [x.id, x])), 500 * s);
  expect(own.waiting).toBe(true);

  const v = layoutTrack(day, w, wide, 500 * s, viewport);
  const at = worldToScreen(wide, shadow.at);
  expect(v.train).toEqual({ x: at.x, y: at.y, angle: shadow.angle, waiting: false, parked: false });
  expect(v.train.y).toBeCloseTo(worldToScreen(wide, { x: 0, y: -200 }).y);
  expect(v.finished).toBe(false);

  day.train = { leg: day.stops.length, departedAt: 0 };
  expect(layoutTrack(day, w, wide, 500 * s, viewport).finished).toBe(true);
});

test('the crowd sits on the waiting stop only', () => {
  const crowdOf = (v: ReturnType<typeof layoutTrack>) => Object.fromEntries(v.stops.map((x) => [x.id, x.crowd]));
  const w = running();
  // Moving: no crowd anywhere.
  expect(crowdOf(layoutTrack(w.tracks[0], w, wide, 500 * s, viewport))).toEqual({ dentist: 0, wristband: 0 });
  // Waiting at Dentist for two and a half leg-times.
  expect(crowdOf(layoutTrack(w.tracks[0], w, wide, 3500 * s, viewport))).toEqual({ dentist: 2, wristband: 0 });

  // t1 crowds Dentist, but the day line through it shows none: an interchange shows one crowd.
  const d = withDay();
  const day = d.tracks.find((t) => t.day)!;
  expect(crowdOf(layoutTrack(d.tracks[0], d, wide, 3500 * s, viewport)).dentist).toBe(2);
  expect(Object.values(crowdOf(layoutTrack(day, d, wide, 3500 * s, viewport)))).toEqual([0, 0, 0]);
});

// A scale at which one grid square is a day: a large circle is below the level, a small
// triangle is at it. Screen x is world x / 2000 + 100.
const dayCamera = { x: 100, y: 100, scale: 0.0005 };
const atScreenX = (x: number) => (x - 100) / 0.0005;

test('below its level a stop is left out of the view, but the line still routes through it', () => {
  const a = stop('a', atScreenX(200), 0);
  const b = stop('b', atScreenX(400), 0, { size: 'large' });
  const c = stop('c', atScreenX(600), 0, { shape: 'triangle', size: 'small' });
  const g = stop('g', atScreenX(800), 0, { shape: 'square' });
  const track = trackOf(['a', 'b', 'c', 'g']);
  const v = layoutTrack(track, worldOf(track, [a, b, c, g]), dayCamera, 1000, viewport);

  expect(v.stops.map((s) => s.id)).toEqual(['a', 'c', 'g']);
  expect(v.segments).toContainEqual([{ x: 200, y: 100 }, { x: 400, y: 100 }]);
});

test('the next stop and the goal show whatever their shape, and so does a kept stop', () => {
  const a = stop('a', atScreenX(200), 0, { size: 'small' });
  const b = stop('b', atScreenX(400), 0, { size: 'small' });
  const g = stop('g', atScreenX(800), 0, { shape: 'square', size: 'small' });
  const track = trackOf(['a', 'b', 'g']);
  const world = worldOf(track, [a, b, g]);

  expect(layoutTrack(track, world, dayCamera, 1000, viewport).stops.map((s) => s.id)).toEqual(['a', 'g']);
  expect(layoutTrack(track, world, dayCamera, 1000, viewport, new Set(['b'])).stops.map((s) => s.id)).toEqual(['a', 'b', 'g']);
});

test('a done dot follows the level of the stop it was', () => {
  const d = stop('d', atScreenX(200), 0, { done: true });
  const a = stop('a', atScreenX(400), 0);
  const g = stop('g', atScreenX(800), 0, { shape: 'square' });
  const track = trackOf(['d', 'a', 'g'], 1);
  const v = layoutTrack(track, worldOf(track, [d, a, g]), dayCamera, 1000, viewport);

  expect(v.stops.map((s) => s.id)).toEqual(['a', 'g']);
});

test('labels make room among the stops that are drawn, not the hidden ones', () => {
  const a = stop('a', atScreenX(200), 0);
  const b = stop('b', atScreenX(290), 0);
  const c = stop('c', atScreenX(350), 0, { shape: 'triangle', size: 'small' });
  const g = stop('g', atScreenX(800), 0, { shape: 'square' });
  const track = trackOf(['a', 'b', 'c', 'g']);
  const v = layoutTrack(track, worldOf(track, [a, b, c, g]), dayCamera, 1000, viewport);

  expect(v.stops.find((s) => s.id === 'c')?.label).toBe(true);
});

test('the view carries the origin in screen pixels', () => {
  const camera = { x: 100, y: 100, scale: 0.1 };
  const track = trackOf(['a']);
  const v = layoutTrack(track, worldOf(track, [stop('a', 1000, 0)]), camera, 0, viewport);
  expect(v.origin).toEqual(worldToScreen(camera, { x: 0, y: 0 }));
});

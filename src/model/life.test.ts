import { describe, expect, test } from 'vitest';
import { withLife } from '../test/fixtures';
import { isRing, keepLife, lifeOf, lifeRoute, lifeWithout, onLife, settleLife, sortedByX } from './life';
import { reduce } from './reducer';
import { lifeState, timeLeftAny } from './train';
import type { World } from './types';

const now = 500_000;

const stopsOf = (world: World) => new Map(world.stops.map((s) => [s.id, s]));
const life = (world: World) => world.tracks.find((t) => t.life)!;

/** withLife with the named stops done. */
function withDone(world: World, ...ids: string[]): World {
  return { ...world, stops: world.stops.map((s) => (ids.includes(s.id) ? { ...s, done: true } : s)) };
}

describe('reading the life line', () => {
  test('lifeOf finds the one life track, and onLife says whether it lists a stop', () => {
    const world = withLife();
    expect(lifeOf(world)?.id).toBe('life');
    expect(lifeOf({ ...world, tracks: world.tracks.filter((t) => !t.life) })).toBeUndefined();
    expect(onLife(world, 'start')).toBe(true);
    expect(onLife(world, 'dentist')).toBe(false);
  });

  test('a square a project lists is a ring, one nothing lists is a bare marker', () => {
    const world = withLife();
    expect(isRing(world, 'wristband')).toBe(true);
    expect(isRing(world, 'start')).toBe(false);
  });

  test('lifeRoute is straight at the life line height through the origin and every stop', () => {
    const world = withLife();
    world.stops = world.stops.map((s) => (s.id === 'far' ? { ...s, y: 123 } : s));
    const route = lifeRoute(life(world), stopsOf(world));
    expect(route.vertices).toEqual([
      { x: 0, y: -800 },
      { x: 500, y: -800 },
      { x: 3000, y: -800 },
      { x: 5000, y: -800 },
    ]);
  });

  test('sortedByX orders ids by x and keeps the order of equal ones', () => {
    const byId = new Map([
      ['a', { x: 30 }],
      ['b', { x: 10 }],
      ['c', { x: 30 }],
      ['d', { x: 20 }],
    ] as [string, { x: number }][]);
    expect(sortedByX(['a', 'b', 'c', 'd'], byId as never)).toEqual(['b', 'd', 'a', 'c']);
  });
});

describe('settleLife', () => {
  test('a life train waiting at an undone square stays', () => {
    const world = withLife();
    expect(settleLife(world, now)).toBe(world);
  });

  test('once its square is done it passes every done square and sets off for the next now, in real time for a marker', () => {
    const world = withDone(withLife(), 'start', 'wristband');
    const settled = settleLife(world, now);
    expect(life(settled).train).toEqual({ leg: 2, departedAt: now });
    expect(life(settled).life!.budgets[2]).toBe(0);
  });

  test('a leg into a ring gets the project time left as its budget', () => {
    const world = withDone(withLife(), 'start');
    const settled = settleLife(world, now);
    expect(life(settled).train).toEqual({ leg: 1, departedAt: now });
    expect(life(settled).life!.budgets[1]).toBe(timeLeftAny(world, 'wristband', now));
  });

  test('a train past every square parks', () => {
    const world = withDone(withLife(), 'start', 'wristband', 'far');
    expect(life(settleLife(world, now)).train.leg).toBe(3);
  });

  test('a ring done further along waits for the earlier square', () => {
    const world = withDone(withLife(), 'wristband');
    expect(settleLife(world, now)).toBe(world);
  });
});

describe('keepLife', () => {
  /** The life line with Far moved to x = 2000: stops re-sorted to start, far, wristband. */
  function reordered(before: World): World {
    const stops = before.stops.map((s) => (s.id === 'far' ? { ...s, x: 2000 } : s));
    return { ...before, stops, tracks: before.tracks.map((t) => (t.life ? { ...t, stops: ['start', 'far', 'wristband'] } : t)) };
  }

  test('after a re-sort the train heads for the first undone square right of where it stood, with a fresh budget, in the same place', () => {
    const before = withDone(withLife(), 'start');
    before.tracks = before.tracks.map((t) => (t.life ? { ...t, train: { leg: 1, departedAt: 7 }, life: { y: -800, budgets: [0, 42, 0] } } : t));
    const stood = lifeState(life(before), before, now).at.x;
    const after = keepLife(before, reordered(before), now);
    expect(life(after).stops).toEqual(['start', 'far', 'wristband']);
    expect(life(after).train.leg).toBe(1);
    expect(life(after).life!.budgets[1]).toBe(0);
    expect(lifeState(life(after), after, now).at.x).toBeCloseTo(stood, 3);
  });

  test('a train still heads for its own square when no undone square sits between', () => {
    const before = withDone(withLife(), 'start');
    before.tracks = before.tracks.map((t) => (t.life ? { ...t, train: { leg: 1, departedAt: 7 }, life: { y: -800, budgets: [0, 42, 0] } } : t));
    const after = keepLife(before, { ...before }, now);
    expect(life(after).train).toEqual({ leg: 1, departedAt: 7 });
    expect(life(after).life!.budgets).toEqual([0, 42, 0]);
  });

  test('a parked train that gains a leg sets off for it now', () => {
    const before = withDone(withLife(), 'start', 'wristband', 'far');
    before.tracks = before.tracks.map((t) => (t.life ? { ...t, train: { leg: 3, departedAt: 7 } } : t));
    const after: World = {
      ...before,
      stops: [...before.stops, { id: 'new', title: '', shape: 'square', size: 'medium', x: 9000, y: -800, done: false }],
      tracks: before.tracks.map((t) => (t.life ? { ...t, stops: [...t.stops, 'new'] } : t)),
    };
    const kept = keepLife(before, after, now);
    expect(life(kept).train).toEqual({ leg: 3, departedAt: now });
    expect(life(kept).life!.budgets).toHaveLength(4);
  });
});

describe('lifeWithout', () => {
  test('removing the square the train heads for makes the next one fresh', () => {
    const off = lifeWithout(life(withLife()), 0);
    expect(off.track.stops).toEqual(['wristband', 'far']);
    expect(off.track.life!.budgets).toHaveLength(2);
    expect(off.track.train.leg).toBe(0);
    expect(off.fresh).toBe(true);
  });

  test('removing a square behind the train moves its leg back by one', () => {
    const world = withLife();
    const track = { ...life(world), train: { leg: 2, departedAt: 0 } };
    const off = lifeWithout(track, 0);
    expect(off.track.train.leg).toBe(1);
    expect(off.fresh).toBe(false);
  });
});

describe('a square added ahead of a moving train', () => {
  test('becomes the square the train heads for, and the train is no further along than it', () => {
    // Start done; the train is mid-leg toward Far (x 5000), set off at 0, and 1000 s have passed.
    const world = withDone(withLife(), 'start', 'wristband');
    world.tracks = world.tracks.map((t) => (t.life ? { ...t, train: { leg: 2, departedAt: 0 } } : t));
    const at = 1_000_000;
    const trainX = lifeState(life(world), world, at).at.x;
    const next = reduce(world, { type: 'addStop', trackId: 'life', id: 'a', shape: 'square', leg: 2, x: trainX + 300, y: 0, now: at });
    expect(life(next).stops).toEqual(['start', 'wristband', 'a', 'far']);
    expect(life(next).train.leg).toBe(2);
    expect(lifeState(life(next), next, at).at.x).toBeLessThanOrEqual(trainX + 300);
    expect(lifeState(life(next), next, at).at.x).toBeCloseTo(trainX, 3);
  });
});

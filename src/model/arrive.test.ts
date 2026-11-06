import { describe, expect, test } from 'vitest';
import { twoLines } from '../test/fixtures';
import { arrivalOf, governingLine, reach, slideTo } from './arrive';
import { trainState } from './train';
import type { Shape, World } from './types';

const S = 1000;
/** Half way down a 1000 s first leg: the train has covered 500 s and has 500 s left. */
const now = 500 * S;

/** One project line t1 from (0, 0) through these stops, the last its goal; its train left at 0. */
function line(stops: [string, number, number][], departedAt = 0): World {
  return {
    tracks: [
      {
        id: 't1',
        color: 0,
        origin: { x: 0, y: 0 },
        stops: stops.map(([id]) => id),
        train: { leg: 0, departedAt },
        target: 'goal',
      },
    ],
    stops: stops.map(([id, x, y], i) => ({
      id,
      title: id,
      shape: (i === stops.length - 1 ? 'square' : 'circle') as Shape,
      size: 'medium' as const,
      x,
      y,
      done: false,
    })),
    lastTouched: null,
  };
}

const byId = (w: World) => new Map(w.stops.map((s) => [s.id, s]));
const stopOf = (w: World, id: string) => w.stops.find((s) => s.id === id)!;

describe('arrivalOf', () => {
  test('is now plus the time left, and now for a stop whose train waits at it', () => {
    const w = line([['a', 1000, 0], ['g', 3000, 0]]);
    expect(arrivalOf(w, 'a', now)).toBeCloseTo(now + 500 * S, -1);
    expect(arrivalOf(w, 'g', now)).toBeCloseTo(now + 2500 * S, -1);
    const waiting = 1100 * S;
    expect(arrivalOf(w, 'a', waiting)).toBe(waiting);
  });
});

describe('slideTo', () => {
  test('a stop two legs ahead of a rolling train, slid an hour earlier, arrives then', () => {
    const w = line([['a', 1000, 0], ['b', 5000, 0], ['g', 9000, 0]]);
    const end = arrivalOf(w, 'b', now) - 3600 * S;
    const slide = slideTo(w, 'b', end, now)!;
    expect(slide.clamped).toBe(false);
    expect(Math.abs(arrivalOf(slide.world, 'b', now) - end)).toBeLessThanOrEqual(S);
    expect(stopOf(slide.world, 'b').x).toBeCloseTo(1400, 0);
  });

  test('a stop whose train is on its leg, slid later, arrives then, and the train keeps the seconds it had covered', () => {
    const w = line([['a', 1000, 0], ['b', 1000, 3000], ['g', 3000, 3000]]);
    const end = now + 1500 * S;
    const slide = slideTo(w, 'a', end, now)!;
    expect(Math.abs(arrivalOf(slide.world, 'a', now) - end)).toBeLessThanOrEqual(S);
    expect(trainState(slide.world.tracks[0], byId(slide.world), now).seconds).toBeCloseTo(500, 3);
    expect(stopOf(slide.world, 'a').y).toBeGreaterThan(0);
  });

  test('a stop whose train waits at it, slid an hour out, sets the train rolling and arrives in an hour', () => {
    const w = line([['a', 1000, 0], ['b', 10000, 0], ['g', 12000, 0]]);
    const later = 1100 * S;
    expect(trainState(w.tracks[0], byId(w), later).waiting).toBe(true);
    const end = later + 3600 * S;
    const slide = slideTo(w, 'a', end, later)!;
    expect(slide.clamped).toBe(false);
    expect(Math.abs(arrivalOf(slide.world, 'a', later) - end)).toBeLessThanOrEqual(S);
    expect(trainState(slide.world.tracks[0], byId(slide.world), later).waiting).toBe(false);
  });

  test('a wanted end before the previous stop arrives lands on that arrival', () => {
    const w = line([['a', 1000, 0], ['b', 5000, 0], ['g', 9000, 0]]);
    const slide = slideTo(w, 'b', now, now)!;
    expect(slide.clamped).toBe(true);
    expect(slide.end).toBeCloseTo(arrivalOf(w, 'a', now), -1);
    expect(Math.abs(arrivalOf(slide.world, 'b', now) - slide.end)).toBeLessThanOrEqual(S);
  });

  test('a wanted end before now lands on now', () => {
    const w = line([['a', 1000, 0], ['g', 3000, 0]]);
    const slide = slideTo(w, 'a', now - 3600 * S, now)!;
    expect(slide.clamped).toBe(true);
    expect(slide.end).toBe(now);
  });

  test('a stop on the straight road to the next lands no later than the next arrival, which does not move', () => {
    const w = line([['a', 1000, 0], ['b', 2000, 0], ['g', 5000, 0]]);
    const next = arrivalOf(w, 'g', now);
    const far = slideTo(w, 'b', next + 3600 * S, now)!;
    expect(far.clamped).toBe(true);
    expect(far.end).toBeCloseTo(next, -1);
    const within = slideTo(w, 'b', arrivalOf(w, 'b', now) + 600 * S, now)!;
    expect(within.clamped).toBe(false);
    expect(Math.abs(arrivalOf(within.world, 'g', now) - next)).toBeLessThanOrEqual(S);
  });

  test('a stop off the road between its neighbours, slid past the bend, still arrives then', () => {
    const w = line([['a', 1000, 0], ['b', 2000, 1000], ['g', 6000, 1000]]);
    const end = arrivalOf(w, 'b', now) + 1500 * S;
    const slide = slideTo(w, 'b', end, now)!;
    expect(slide.clamped).toBe(false);
    expect(Math.abs(arrivalOf(slide.world, 'b', now) - end)).toBeLessThanOrEqual(S);
  });

  test('a stop bent off the road has a latest end before the next stop arrives', () => {
    const w = line([['p', 1000, 0], ['a', 1500, 1000], ['n', 2000, 0], ['g', 3000, 0]]);
    const r = reach(w, 'a', now)!;
    expect(r.latest).not.toBeNull();
    expect(r.latest!).toBeLessThan(arrivalOf(w, 'n', now) - 100 * S);
  });

  test('a goal slid later runs its last leg on along its last direction, and nothing else moves', () => {
    const w = line([['a', 1000, 0], ['g', 3000, 0]]);
    const end = arrivalOf(w, 'g', now) + 1000 * S;
    const slide = slideTo(w, 'g', end, now)!;
    expect(stopOf(slide.world, 'g')).toMatchObject({ x: expect.closeTo(4000, 0), y: 0 });
    expect(stopOf(slide.world, 'a')).toEqual(stopOf(w, 'a'));
    expect(reach(w, 'g', now)!.latest).toBeNull();
  });

  test('a goal slid earlier shortens its last leg along its road', () => {
    const w = line([['a', 1000, 0], ['g', 3000, 0]]);
    const end = arrivalOf(w, 'g', now) - 1000 * S;
    const slide = slideTo(w, 'g', end, now)!;
    expect(stopOf(slide.world, 'g')).toMatchObject({ x: expect.closeTo(2000, 0), y: 0 });
  });

  test('a stop on two lines slides along the one that reaches it first, and lands where it says', () => {
    const w = twoLines();
    expect(governingLine(w, 'shared', now)!.track.id).toBe('t2');
    for (const extra of [200, 1200, 5000]) {
      const slide = slideTo(w, 'shared', arrivalOf(w, 'shared', now) + extra * S, now)!;
      expect(Math.abs(arrivalOf(slide.world, 'shared', now) - slide.end)).toBeLessThanOrEqual(S);
    }
  });

  test('a done stop, or one on no project, has no slide', () => {
    const w = line([['a', 1000, 0], ['g', 3000, 0]]);
    w.stops[0].done = true;
    expect(slideTo(w, 'a', now + 1000 * S, now)).toBeNull();
    expect(slideTo(w, 'nope', now + 1000 * S, now)).toBeNull();
  });
});

import { describe, expect, test } from 'vitest';
import { twoLines, withLife } from '../test/fixtures';
import { arrivalOf, governingLine, reach, setArrival, setLeg, slideTo, timesOf } from './arrive';
import { legSeconds, timeLeft, trackRoute, trainState } from './train';
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

/** The seconds of leg i of line t1. */
const legOf = (w: World, i: number, id = 't1') => legSeconds(trackRoute(w.tracks.find((t) => t.id === id)!, byId(w)), i);
const leftTo = (w: World, stopId: string, at = now) => timeLeft(w.tracks[0], stopId, byId(w), at);

describe('setLeg', () => {
  test('sets one leg to exactly the time asked, and moves nothing before it', () => {
    const w = line([['flowers', 1000, 0], ['gift', 3000, 0]]);
    const next = setLeg(w, 'gift', 1800, now)!;
    expect(legOf(next, 1)).toBeCloseTo(1800, 0);
    expect(stopOf(next, 'flowers')).toMatchObject({ x: 1000, y: 0 });
    expect(trainState(next.tracks[0], byId(next), now).seconds).toBeCloseTo(500);
  });

  test('a longer leg carries every stop after it by the same offset, so their legs keep their time', () => {
    const w = line([['flowers', 1000, 0], ['gift', 3000, 0]]);
    const next = setLeg(w, 'flowers', 2000, now)!;
    expect(legOf(next, 0)).toBeCloseTo(2000, 0);
    expect(legOf(next, 1)).toBeCloseTo(2000, 6);
    expect(stopOf(next, 'gift').x - 3000).toBeCloseTo(stopOf(next, 'flowers').x - 1000, 6);
    expect(trainState(next.tracks[0], byId(next), now)).toMatchObject({ leg: 0 });
    expect(trainState(next.tracks[0], byId(next), now).seconds).toBeCloseTo(500);
  });

  test('a shorter leg puts the stop back along its own road', () => {
    const w = line([['a', 1000, 0], ['g', 3000, 1000]]);
    // a to g is a 45 degree run over 1000 then 1000 straight; 1000 s of it ends on the diagonal.
    const next = setLeg(w, 'g', 1000, now)!;
    expect(legOf(next, 1)).toBeCloseTo(1000, 0);
    expect(stopOf(next, 'g').x).toBeCloseTo(1000 + 1000 / Math.SQRT2, 3);
    expect(stopOf(next, 'g').y).toBeCloseTo(1000 / Math.SQRT2, 3);
  });

  test('a longer leg into a step runs on along its own road, never toward the next station', () => {
    const w = line([['a', 1000, 0], ['b', 2000, 1000], ['g', 4000, 1000]]);
    const before = legOf(w, 1);
    const next = setLeg(w, 'b', before + 500, now)!;
    expect(legOf(next, 1)).toBeCloseTo(before + 500, 0);
    expect(legOf(next, 2)).toBeCloseTo(legOf(w, 2), 6);
    // The leg into b is one diagonal, so b goes on down it rather than along toward g.
    expect(stopOf(next, 'b').y).toBeGreaterThan(1000);
  });

  test('refuses nothing at all, a done stop, a ring, and every stop on a line whose goal is a ring', () => {
    const w = line([['flowers', 1000, 0], ['gift', 3000, 0]]);
    expect(setLeg(w, 'gift', 0, now)).toBeNull();
    const done = line([['flowers', 1000, 0], ['gift', 3000, 0]]);
    done.stops[0].done = true;
    expect(setLeg(done, 'flowers', 900, now)).toBeNull();
    const life = withLife();
    expect(setLeg(life, 'wristband', 900, now)).toBeNull();
    expect(setLeg(life, 'dentist', 900, now)).toBeNull();
  });

  test('a shared stop it carries re-routes the other line, whose train keeps its place', () => {
    const w = twoLines();
    const t2 = () => trainState(w.tracks[1], byId(w), now).seconds;
    const s2 = t2();
    const next = setLeg(w, 'dentist', 2000, now)!;
    expect(stopOf(next, 'shared').x).toBeGreaterThan(1500);
    expect(trainState(next.tracks[1], byId(next), now).seconds).toBeCloseTo(s2);
  });
});

describe('stops that must stay', () => {
  /** t1 runs 0 -> a -> d -> g with d done from another line, ahead of the train. */
  const pastDone = () => {
    const w = line([['a', 1000, 0], ['d', 2000, 500], ['g', 3000, 0]]);
    stopOf(w, 'd').done = true;
    return w;
  };
  /** t1 runs 0 -> a -> x -> g1; t2 runs from (2500, 400) -> x -> g2, and at 800 s its train waits at x. */
  const sharedWait = () => {
    const w = line([['a', 1000, 0], ['x', 3000, 0], ['g1', 5000, 0]]);
    w.tracks.push({ id: 't2', color: 1, origin: { x: 2500, y: 400 }, stops: ['x', 'g2'], train: { leg: 0, departedAt: 0 }, target: 'goal' });
    w.stops.push({ id: 'g2', title: 'g2', shape: 'square', size: 'medium', x: 5000, y: 400, done: false });
    return w;
  };
  const late = 800 * S;

  test('a typed time that would leave a done stop behind is refused, and the editor says so', () => {
    const w = pastDone();
    expect(setArrival(w, 'g', 86_400, now)).toBeNull();
    expect(setLeg(w, 'a', 5000, now)).toBeNull();
    expect(timesOf(w, 'g', now)).toMatchObject({ editable: false });
    // After the done stop nothing must stay, so the last leg still takes a time.
    expect(legOf(setLeg(w, 'g', 3000, now)!, 2)).toBeCloseTo(3000, 0);
  });

  test('a train rolling into a done stop leaves no from-now field that silently does nothing', () => {
    const w = line([['d', 1000, 0], ['b', 2000, 0], ['g', 3000, 0]]);
    stopOf(w, 'd').done = true;
    expect(trainState(w.tracks[0], byId(w), now)).toMatchObject({ leg: 0, waiting: false });
    expect(timesOf(w, 'b', now)).toMatchObject({ editable: false });
    expect(setArrival(w, 'b', 86_400, now)).toBeNull();
  });

  test("a typed time never moves the stop another line's train waits at", () => {
    const w = sharedWait();
    expect(trainState(w.tracks[1], byId(w), late)).toMatchObject({ waiting: true, leg: 0 });
    expect(setLeg(w, 'a', 2000, late)).toBeNull();
    expect(setLeg(w, 'a', 500, late)).toBeNull();
    expect(timesOf(w, 'g1', late)).toMatchObject({ editable: false });
    // Earlier, with t2 still rolling toward x, the same edit carries x and t2 keeps its place.
    const early = 300 * S;
    const before = trainState(w.tracks[1], byId(w), early).seconds;
    const next = setLeg(w, 'a', 2000, early)!;
    expect(stopOf(next, 'x').x).toBeCloseTo(4000, 0);
    expect(trainState(next.tracks[1], byId(next), early).seconds).toBeCloseTo(before);
  });
});

describe('setArrival', () => {
  test('makes the stop arrive that long from now by changing only the leg the train is on', () => {
    const w = line([['flowers', 1000, 0], ['gift', 3000, 0]]);
    const next = setArrival(w, 'gift', 259_200, now)!;
    expect(leftTo(next, 'gift')).toBeCloseTo(259_200, 0);
    expect(legOf(next, 1)).toBeCloseTo(2000, 6);
    expect(leftTo(next, 'flowers')).toBeCloseTo(259_200 - 2000, 0);
  });

  test('earlier than the train can get there lands at the earliest it can', () => {
    const w = line([['flowers', 1000, 0], ['gift', 3000, 0]]);
    const next = setArrival(w, 'gift', 100, now)!;
    // The train has run 500 s; at the soonest Flowers is where it is now and Gift is 2000 s on.
    expect(leftTo(next, 'gift')).toBeCloseTo(2000, 0);
    expect(trainState(next.tracks[0], byId(next), now)).toMatchObject({ waiting: true });
  });

  test('with the train waiting at a stop, that stop stays and the leg after it changes', () => {
    const late = 1100 * S; // the train reached Flowers at 1000 s
    const w = line([['flowers', 1000, 0], ['gift', 3000, 0]]);
    expect(trainState(w.tracks[0], byId(w), late)).toMatchObject({ waiting: true, leg: 0 });
    const next = setArrival(w, 'gift', 5000, late)!;
    expect(stopOf(next, 'flowers')).toMatchObject({ x: 1000, y: 0 });
    expect(legOf(next, 1)).toBeCloseTo(5000, 0);
    expect(setArrival(w, 'flowers', 5000, late)).toBeNull();
  });
});

describe('timesOf', () => {
  test('reads the leg into a stop, what it comes after, and how long until its train gets there', () => {
    const w = line([['flowers', 1000, 0], ['gift', 3000, 0]]);
    expect(timesOf(w, 'gift', now)).toMatchObject({ trackId: 't1', leg: 2000, after: 'flowers', editable: true });
    expect(timesOf(w, 'gift', now)!.fromNow).toBeCloseTo(2500, 0);
    expect(timesOf(w, 'flowers', now)).toMatchObject({ after: 'the start', editable: true });
    w.stops[0].title = '';
    expect(timesOf(w, 'gift', now)!.after).toBe('the last stop');
  });

  test('a stop the train waits at, a ring, and a done stop do not take typed times', () => {
    const w = line([['flowers', 1000, 0], ['gift', 3000, 0]]);
    expect(timesOf(w, 'flowers', 1100 * S)).toMatchObject({ editable: false, fromNow: 0 });
    expect(timesOf(withLife(), 'wristband', now)).toMatchObject({ editable: false });
    expect(timesOf(withLife(), 'dentist', now)).toMatchObject({ editable: false });
    w.stops[1].done = true;
    expect(timesOf(w, 'gift', now)).toBeNull();
  });
});

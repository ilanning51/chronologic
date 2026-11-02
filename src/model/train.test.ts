import { describe, expect, test } from 'vitest';
import { running, twoLines, withDay } from '../test/fixtures';
import type { Stop, Track, World } from './types';
import { legSpan, pointAlong } from '../plane/routing';
import { dayState, legSeconds, nextIndex, rebase, stateOf, targetIndex, timeLeft, timeLeftAny, trackRoute, trainState } from './train';

function stop(id: string, shape: Stop['shape'], x: number, y: number): Stop {
  return { id, title: id, shape, size: 'medium', x, y, done: false };
}

const a = stop('a', 'circle', 1000, 0);
const b = stop('b', 'triangle', 1000, 1000);
const g = stop('g', 'square', 3000, 1000);
const byId = new Map([a, b, g].map((s) => [s.id, s]));
const track: Track = {
  id: 't',
  color: 0,
  origin: { x: 0, y: 0 },
  stops: ['a', 'b', 'g'],
  train: { leg: 0, departedAt: 0 },
  target: 'next',
};

/** The world's first track and its stops, with the named stops marked done. */
function withDone(world: World, ...done: string[]): { track: Track; byId: Map<string, Stop> } {
  const stops = world.stops.map((s) => (done.includes(s.id) ? { ...s, done: true } : s));
  return { track: world.tracks[0], byId: new Map(stops.map((s) => [s.id, s])) };
}

describe('train', () => {
  test('mid-leg the train is on the path at the profile fraction', () => {
    const s = trainState(track, byId, 500_000);
    expect(s).toMatchObject({ leg: 0, waiting: false, parked: false, seconds: 500, fraction: 0.5 });
    expect(s.at).toEqual({ x: 500, y: 0 });
  });

  test('a week asleep: the train is at the stop and waiting, never beyond', () => {
    const s = trainState(track, byId, 7 * 86400 * 1000);
    expect(s).toMatchObject({ leg: 0, waiting: true, fraction: 1, seconds: 1000 });
    expect(s.at).toEqual({ x: 1000, y: 0 });
  });

  test('a zero-length leg is waiting at once, with no NaN', () => {
    const flat = new Map(byId).set('a', stop('a', 'circle', 0, 0));
    const s = trainState(track, flat, 123_456);
    expect(s).toMatchObject({ leg: 0, waiting: true, parked: false, fraction: 1, seconds: 0 });
    expect(s.at).toEqual({ x: 0, y: 0 });
    expect(Number.isNaN(s.angle)).toBe(false);
  });

  test('parked after the goal', () => {
    const s = trainState({ ...track, train: { leg: 3, departedAt: 0 } }, byId, 5_000_000);
    expect(s).toMatchObject({ leg: 3, parked: true, waiting: false, fraction: 1, seconds: 0 });
    expect(s.at).toEqual({ x: 3000, y: 1000 });
  });

  test('rebase keeps the offset: the same seconds on a longer leg gives an earlier fraction', () => {
    const longer = new Map(byId).set('a', stop('a', 'circle', 2000, 0)); // leg 0 is now 2000 s
    const t = rebase(0, 500, 2000, 1_000_000);
    const s = trainState({ ...track, train: t }, longer, 1_000_000);
    expect(s.seconds).toBeCloseTo(500);
    expect(s.fraction).toBeCloseTo(0.25);
  });

  test('rebase past the end is waiting', () => {
    const t = rebase(0, 1200, 1000, 5_000_000);
    const s = trainState({ ...track, train: t }, byId, 5_000_000);
    expect(s).toMatchObject({ waiting: true, fraction: 1, seconds: 1000 });
  });

  test('targetIndex follows the setting', () => {
    expect(targetIndex({ ...track, target: 'next' }, byId)).toBe(0);
    expect(targetIndex({ ...track, target: 'subgoal' }, byId)).toBe(1);
    expect(targetIndex({ ...track, target: 'goal' }, byId)).toBe(2);
    expect(targetIndex({ ...track, train: { leg: 3, departedAt: 0 } }, byId)).toBeNull();
  });

  test('nextIndex is the leg on a fresh track, and null once the train has parked', () => {
    expect(nextIndex(track, byId)).toBe(0);
    expect(nextIndex({ ...track, train: { leg: 3, departedAt: 0 } }, byId)).toBeNull();
  });

  test('the next stop is the first undone stop at or after the leg', () => {
    const { track: t, byId: stops } = withDone(running(), 'dentist');
    expect(t.train.leg).toBe(0);
    expect(nextIndex(t, stops)).toBe(1);
  });

  test('a train rolls through a done stop without waiting and on to the next', () => {
    const { track: t, byId: stops } = withDone(running(), 'dentist');
    expect(trainState(t, stops, 500_000)).toMatchObject({ leg: 0, waiting: false, parked: false });
    expect(trainState(t, stops, 1_000_000)).toMatchObject({ leg: 1, seconds: 0, waiting: false, parked: false });
    const rolling = trainState(t, stops, 1_500_000);
    expect(rolling).toMatchObject({ leg: 1, waiting: false, parked: false });
    expect(rolling.at.x).toBeGreaterThan(1000);
    for (const now of [3_000_000, 9_000_000]) {
      const s = trainState(t, stops, now);
      expect(s).toMatchObject({ leg: 1, waiting: true, parked: false });
      expect(s.at).toEqual({ x: 3000, y: 0 });
    }
    expect(nextIndex(t, stops)).toBe(1);
  });

  test('every stop done and passed means parked', () => {
    const { track: t, byId: stops } = withDone(running(), 'dentist', 'wristband');
    const s = trainState(t, stops, 4_000_000);
    expect(s).toMatchObject({ leg: 2, parked: true, waiting: false });
    expect(s.at).toEqual({ x: 3000, y: 0 });
    expect(nextIndex(t, stops)).toBeNull();
  });

  test('trackRoute starts at the origin and visits every stop', () => {
    const route = trackRoute(track, byId);
    expect(route.stationAt).toHaveLength(4);
    expect(route.vertices[0]).toEqual({ x: 0, y: 0 });
  });

});

/** Stops of a world by id. */
function index(world: World): Map<string, Stop> {
  return new Map(world.stops.map((s) => [s.id, s]));
}

describe('the shadow rule', () => {
  test('time left to a stop is the time left on this leg plus the legs up to it', () => {
    const world = running();
    const t1 = world.tracks[0];
    expect(timeLeft(t1, 'dentist', index(world), 500_000)).toBeCloseTo(500, 6);
    expect(timeLeft(t1, 'wristband', index(world), 500_000)).toBeCloseTo(2500, 6);
  });

  test('time left is time, not distance: a braking train has more time than distance left', () => {
    const world = running();
    const t1 = world.tracks[0];
    const byId = index(world);
    const state = trainState(t1, byId, 900_000);
    expect(timeLeft(t1, 'dentist', byId, 900_000)).toBeCloseTo(100, 6);
    expect(1000 - state.seconds).toBeLessThan(100);
  });

  test('time left stands still while the train waits at an earlier stop', () => {
    const world = running();
    const t1 = world.tracks[0];
    const byId = index(world);
    const early = timeLeft(t1, 'wristband', byId, 1_500_000);
    expect(early).toBeCloseTo(2000, 6);
    expect(timeLeft(t1, 'wristband', byId, 2_500_000)).toBe(early);
    expect(timeLeft(t1, 'dentist', byId, 1_500_000)).toBe(0);
  });

  test('time left is zero for a done or passed stop and smallest across lines', () => {
    const done = withDone(running(), 'dentist');
    expect(timeLeft(done.track, 'dentist', done.byId, 500_000)).toBe(0);

    const world = running();
    const passed: Track = { ...world.tracks[0], train: { leg: 1, departedAt: 0 } };
    expect(timeLeft(passed, 'dentist', index(world), 500_000)).toBe(0);

    const two = twoLines();
    const byId = index(two);
    const viaT1 = timeLeft(two.tracks[0], 'shared', byId, 0);
    const viaT2 = timeLeft(two.tracks[1], 'shared', byId, 0);
    expect(viaT2).toBeCloseTo(1500, 6);
    expect(viaT1).toBeGreaterThan(viaT2);
    expect(timeLeftAny(two, 'shared', 0)).toBe(viaT2);
    expect(timeLeftAny(two, 'nowhere', 0)).toBe(0);
  });

  test('time left over every line ignores the day line', () => {
    const world = withDay();
    expect(timeLeftAny(world, 'dayEnd', 0)).toBe(0);
    expect(timeLeftAny(world, 'dentist', 500_000)).toBeCloseTo(500, 6);
  });

  test('the day train is as far along its leg as the project time has run down', () => {
    const world = withDay();
    const day = world.tracks.find((t) => t.day)!;
    const route = trackRoute(day, index(world));
    const { from, to } = legSpan(route, 0);
    const length = legSeconds(route, 0);

    const start = dayState(day, world, 0);
    expect(start).toMatchObject({ leg: 0, parked: false, waiting: false, fraction: 0, seconds: 0 });
    expect(start.at).toEqual(day.origin);

    const half = dayState(day, world, 500_000);
    expect(half.fraction).toBeCloseTo(0.5, 6);
    expect(half.waiting).toBe(false);
    expect(half.seconds).toBeCloseTo(0.5 * length, 6);
    const expected = pointAlong(route.vertices, from, to, half.fraction);
    expect(half.at.x).toBeCloseTo(expected.at.x, 6);
    expect(half.at.y).toBeCloseTo(expected.at.y, 6);

    // Linear, not the profile: at 900 s the project train has a tenth of its time left.
    expect(dayState(day, world, 900_000).fraction).toBeCloseTo(0.9, 6);
  });

  test('pulling the leg longer slides the day train back, never below zero', () => {
    const world = withDay();
    world.stops = world.stops.map((s) => (s.id === 'dentist' ? { ...s, x: 2000 } : s));
    const day = world.tracks.find((t) => t.day)!;
    const s = dayState(day, world, 500_000);
    expect(timeLeftAny(world, 'dentist', 500_000)).toBeCloseTo(1500, 6);
    expect(s).toMatchObject({ leg: 0, waiting: false, fraction: 0, seconds: 0 });
    expect(s.at).toEqual(day.origin);
  });

  test('budget zero means waiting at the stop', () => {
    const world = withDay();
    const day = { ...world.tracks.find((t) => t.day)!, train: { leg: 1, departedAt: 0 } };
    const s = dayState(day, world, 0);
    expect(s).toMatchObject({ leg: 1, parked: false, waiting: true, fraction: 1 });
    expect(s.at.x).toBeCloseTo(1500, 6);
    expect(s.at.y).toBeCloseTo(600, 6);
  });

  test('a day train past its last stop is parked at the last stop', () => {
    const world = withDay();
    const day = { ...world.tracks.find((t) => t.day)!, train: { leg: 3, departedAt: 0 } };
    const s = dayState(day, world, 0);
    expect(s).toMatchObject({ leg: 3, parked: true, waiting: false, fraction: 1 });
    expect(s.at.x).toBeCloseTo(1500, 6);
    expect(s.at.y).toBeCloseTo(900, 6);
  });
});

test('stateOf is the shadow for the day train and the own clock for every other', () => {
  const w = withDay();
  const byId = new Map(w.stops.map((s) => [s.id, s]));
  const [t1, , day] = w.tracks;
  expect(stateOf(day, w, 500_000)).toEqual(dayState(day, w, 500_000));
  expect(stateOf(day, w, 500_000).at).toEqual({ x: 1000, y: -200 });
  expect(stateOf(t1, w, 500_000)).toEqual(trainState(t1, byId, 500_000));
});

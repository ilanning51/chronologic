import { describe, expect, test } from 'vitest';
import { running } from '../test/fixtures';
import type { Stop, Track, World } from './types';
import { nextIndex, rebase, targetIndex, trackRoute, trainState } from './train';

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

  test('nextIndex is the leg, or null when parked', () => {
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

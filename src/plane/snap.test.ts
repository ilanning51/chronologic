import { describe, expect, test } from 'vitest';
import { running, twoLines, withLife } from '../test/fixtures';
import type { Stop, World } from '../model/types';
import { nearestStop, snapToAll, snapToLife, snapToTracks } from './snap';

const NOW = 500_000; // 500 s into the 1000 s leg to Dentist

test('snaps to the nearest path ahead of the train, never behind it or past the goal', () => {
  const world = running();
  // Behind the train on the first leg.
  expect(snapToTracks(world, { x: 200, y: 6 }, NOW, 50)).toBeNull();
  // Ahead of the train on its own leg.
  expect(snapToTracks(world, { x: 700, y: 6 }, NOW, 50)).toEqual({ trackId: 't1', leg: 0, offset: 700, at: { x: 700, y: 0 } });
  // On the leg from Dentist to Wristband.
  expect(snapToTracks(world, { x: 1500, y: 30 }, NOW, 50)).toEqual({ trackId: 't1', leg: 1, offset: 500, at: { x: 1500, y: 0 } });
  // Just past the goal, well inside the radius.
  expect(snapToTracks(world, { x: 3010, y: 0 }, NOW, 50)).toBeNull();
  // A parked track takes nothing.
  world.tracks[0].train = { leg: 2, departedAt: 0 };
  expect(snapToTracks(world, { x: 1500, y: 0 }, NOW, 50)).toBeNull();
});

test('nothing near returns null', () => {
  expect(snapToTracks(running(), { x: 1500, y: 400 }, NOW, 50)).toBeNull();
});

test('a drop on top of a stop, or close enough to hide under it, snaps nowhere', () => {
  const world = running();
  expect(snapToTracks(world, { x: 1000, y: 5 }, NOW, 50)).toBeNull();
  expect(snapToTracks(world, { x: 1030, y: 5 }, NOW, 50)).toBeNull();
  expect(snapToTracks(world, { x: 2970, y: 5 }, NOW, 50)).toBeNull();
  // Clear of both stops it snaps as usual.
  expect(snapToTracks(world, { x: 1060, y: 5 }, NOW, 50)).toEqual({ trackId: 't1', leg: 1, offset: 60, at: { x: 1060, y: 0 } });
});

/** running() and a second line t2 just below t1, straight from its origin to Goal 2. */
function parallel(): World {
  const world = running();
  world.tracks.push({ id: 't2', color: 1, origin: { x: 0, y: 60 }, stops: ['goal2'], train: { leg: 0, departedAt: 0 }, target: 'goal' });
  world.stops.push({ id: 'goal2', title: 'Goal 2', shape: 'square', size: 'large', x: 3000, y: 60, done: false });
  return world;
}

test('snapToAll lists every line within radius nearest first and skips lines the stop is on', () => {
  const world = parallel();
  expect(snapToAll(world, { x: 700, y: 20 }, NOW, 50)).toEqual([
    { trackId: 't1', leg: 0, offset: 700, at: { x: 700, y: 0 } },
    { trackId: 't2', leg: 0, offset: 700, at: { x: 700, y: 60 } },
  ]);
  expect(snapToAll(world, { x: 700, y: 45 }, NOW, 50).map((h) => h.trackId)).toEqual(['t2', 't1']);
  // Dentist is on t1, so dragged here it can only join t2.
  expect(snapToAll(world, { x: 700, y: 20 }, NOW, 50, 'dentist').map((h) => h.trackId)).toEqual(['t2']);
  expect(snapToAll(world, { x: 700, y: 400 }, NOW, 50)).toEqual([]);
});

test('snapToAll never offers the day line', () => {
  const world = parallel();
  world.tracks[1].day = { date: '2026-11-01', budgets: [3600], lengths: [3600] };
  expect(snapToAll(world, { x: 700, y: 45 }, NOW, 50).map((h) => h.trackId)).toEqual(['t1']);
  expect(snapToTracks(world, { x: 700, y: 58 }, NOW, 50)).toBeNull();
});

test('a dragged stop does not block its own snap', () => {
  // Dentist dragged live onto t2's path: t1 now runs through it too, but lists it, so t2 takes it.
  const world = twoLines();
  world.stops = world.stops.map((s) => (s.id === 'dentist' ? { ...s, x: 1000, y: 600 } : s));
  expect(snapToTracks(world, { x: 1000, y: 600 }, NOW, 50, 'dentist')).toEqual({
    trackId: 't2',
    leg: 0,
    offset: 1000,
    at: { x: 1000, y: 600 },
  });
});

test('nearestStop finds the closest pending stop within radius', () => {
  const stops = twoLines().stops.map((s) => (s.id === 'wristband' ? { ...s, done: true } : s));
  expect(nearestStop(stops, { x: 1020, y: 10 }, 50)?.id).toBe('dentist');
  expect(nearestStop(stops, { x: 1480, y: 590 }, 50)?.id).toBe('shared');
  // Two in reach: the closer wins.
  const near: Stop = { id: 'near', title: '', shape: 'circle', size: 'small', x: 1040, y: 0, done: false };
  expect(nearestStop([...stops, near], { x: 1030, y: 0 }, 50)?.id).toBe('near');
  // A done stop, or one out of reach, is nothing.
  expect(nearestStop(stops, { x: 3000, y: 0 }, 50)).toBeNull();
  expect(nearestStop(stops, { x: 1100, y: 0 }, 50)).toBeNull();
});

describe('the life line', () => {
  /** withLife with every square done and the life train parked at Far, x = 5000, at y = -800. */
  function parkedLife(): World {
    const world = withLife();
    world.stops = world.stops.map((s) => (['start', 'wristband', 'far'].includes(s.id) ? { ...s, done: true, doneAt: 1 } : s));
    world.tracks = world.tracks.map((t) => (t.life ? { ...t, train: { leg: 3, departedAt: 0 } } : t));
    return world;
  }

  test('offers a square a place anywhere right of the life train, at the life height, with the leg it sorts into', () => {
    const world = withLife();
    // The train has not left the origin at x = 0. Between Start (500) and Wristband (3000).
    expect(snapToLife(world, { x: 2000, y: -790 }, 0, 50)).toEqual({ trackId: 'life', leg: 1, offset: 1500, at: { x: 2000, y: -800 } });
    // Left of the first square, and past the last one.
    expect(snapToLife(world, { x: 200, y: -800 }, 0, 50)).toEqual({ trackId: 'life', leg: 0, offset: 200, at: { x: 200, y: -800 } });
    expect(snapToLife(world, { x: 6000, y: -800 }, 0, 50)).toEqual({ trackId: 'life', leg: 3, offset: 1000, at: { x: 6000, y: -800 } });
  });

  test('offers nothing at or left of the life train, away from the line, or on top of a square', () => {
    expect(snapToLife(parkedLife(), { x: 4000, y: -800 }, 0, 50)).toBeNull();
    expect(snapToLife(parkedLife(), { x: 6000, y: -800 }, 0, 50)).not.toBeNull();
    expect(snapToLife(withLife(), { x: 2000, y: -700 }, 0, 50)).toBeNull();
    expect(snapToLife(withLife(), { x: 3020, y: -800 }, 0, 50)).toBeNull();
    // The square being carried is never in its own way.
    expect(snapToLife(withLife(), { x: 3020, y: -800 }, 0, 50, 'wristband')).not.toBeNull();
  });

  test('a world without a life line offers nothing', () => {
    expect(snapToLife(running(), { x: 2000, y: 0 }, 0, 50)).toBeNull();
  });

  test('snapToAll never offers the life line, whatever is dropped on it', () => {
    expect(snapToAll(withLife(), { x: 2000, y: -800 }, 0, 50).map((h) => h.trackId)).not.toContain('life');
  });
});

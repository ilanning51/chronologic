import type { World } from '../model/types';

/** One running track: Dentist (a medium circle) then Wristband (a large square, the goal). */
export function running(): World {
  return {
    tracks: [
      {
        id: 't1',
        color: 0,
        origin: { x: 0, y: 0 },
        stops: ['dentist', 'wristband'],
        train: { leg: 0, departedAt: 0 },
        target: 'goal',
      },
    ],
    stops: [
      { id: 'dentist', title: 'Dentist', shape: 'circle', size: 'medium', x: 1000, y: 0, done: false },
      { id: 'wristband', title: 'Wristband', shape: 'square', size: 'large', x: 3000, y: 0, done: false },
    ],
    lastTouched: null,
  };
}

/**
 * running() and a second line t2 below it, through Shared (a medium circle) to Goal 2. Shared is
 * also t1's second stop, so it is one point on two lines: t1 is dentist, shared, wristband.
 */
export function twoLines(): World {
  const world = running();
  world.tracks[0].stops = ['dentist', 'shared', 'wristband'];
  world.tracks.push({
    id: 't2',
    color: 1,
    origin: { x: 0, y: 600 },
    stops: ['shared', 'goal2'],
    train: { leg: 0, departedAt: 0 },
    target: 'goal',
  });
  world.stops.push(
    { id: 'shared', title: 'Shared', shape: 'circle', size: 'medium', x: 1500, y: 600, done: false },
    { id: 'goal2', title: 'Goal 2', shape: 'square', size: 'large', x: 3000, y: 600, done: false },
  );
  return world;
}

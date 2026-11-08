import { addDays } from '../model/days';
import type { Shape, Size, World } from '../model/types';

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

/**
 * running() and the life line above it at y = -800: a bare marker Start (x 500), then Wristband
 * (t1's goal, moved up onto the life line, so a ring), then a bare marker Far (x 5000).
 */
export function withLife(): World {
  const world = running();
  const y = -800;
  world.stops.find((s) => s.id === 'wristband')!.y = y;
  world.tracks.push({
    id: 'life',
    color: 0,
    origin: { x: 0, y },
    stops: ['start', 'wristband', 'far'],
    train: { leg: 0, departedAt: 0 },
    target: 'next',
    life: { y, budgets: [0, 0, 0] },
  });
  world.stops.push(
    { id: 'start', title: 'Start', shape: 'square', size: 'medium', x: 500, y, done: false },
    { id: 'far', title: 'Far', shape: 'square', size: 'large', x: 5000, y, done: false },
  );
  return world;
}

/**
 * twoLines() and today's day line: Dentist, then Shared, then the day's-end square. The first
 * budget is Dentist's time left at 0 s; the later ones are written as the day train gets there.
 */
export function withDay(date = '2026-11-01'): World {
  const world = twoLines();
  world.tracks.push({
    id: 'day',
    color: 2,
    origin: { x: 1000, y: -400 },
    stops: ['dentist', 'shared', 'dayEnd'],
    train: { leg: 0, departedAt: 0 },
    target: 'next',
    day: { date, budgets: [1000, 0, 0], lengths: [3600, 3600, 1800] },
  });
  world.stops.push({ id: 'dayEnd', title: '', shape: 'square', size: 'small', x: 1500, y: 900, done: false });
  return world;
}

/**
 * withDay(date) and the next day's line, held: Goal 2, then its own end square. Its train waits at its
 * start until its day begins.
 */
export function withWeek(date = '2026-11-01'): World {
  const world = withDay(date);
  world.tracks.push({
    id: 'day2',
    color: 3,
    origin: { x: 3000, y: 200 },
    stops: ['goal2', 'dayEnd2'],
    train: { leg: 0, departedAt: 0 },
    target: 'next',
    day: { date: addDays(date, 1), budgets: [0, 0], lengths: [7200, 1800], held: true, placed: true },
  });
  world.stops.push({ id: 'dayEnd2', title: '', shape: 'square', size: 'small', x: 3000, y: 900, done: false });
  return world;
}

/**
 * Three project lines long enough that their stops fall on the days ahead of `now`. t1 from (0, 0):
 * Alpha, Bravo, then its goal. t2 from (0, 50000): Charlie, then its goal. t3 is a sketch: only
 * its goal, Dream. Every train set off 500 s before `now`.
 */
export function weekLines(now: number): World {
  const stop = (id: string, x: number, y: number, shape: Shape = 'circle', size: Size = 'medium') => ({
    id,
    title: id,
    shape,
    size,
    x,
    y,
    done: false,
  });
  const departedAt = now - 500_000;
  return {
    tracks: [
      { id: 't1', color: 0, origin: { x: 0, y: 0 }, stops: ['alpha', 'bravo', 'g1'], train: { leg: 0, departedAt }, target: 'goal' },
      { id: 't2', color: 1, origin: { x: 0, y: 50000 }, stops: ['charlie', 'g2'], train: { leg: 0, departedAt }, target: 'goal' },
      { id: 't3', color: 2, origin: { x: 0, y: 90000 }, stops: ['dream'], train: { leg: 0, departedAt }, target: 'goal' },
    ],
    stops: [
      stop('alpha', 100000, 0),
      stop('bravo', 300000, 0, 'triangle', 'small'),
      stop('g1', 600000, 0, 'square', 'large'),
      stop('charlie', 120000, 50000),
      stop('g2', 600000, 50000, 'square', 'large'),
      stop('dream', 900000, 90000, 'square', 'large'),
    ],
    lastTouched: null,
  };
}

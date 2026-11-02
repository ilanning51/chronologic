import { timeLeftAny } from './train';
import type { Track, World } from './types';

/** The one day track, if there is one. */
export function dayTrack(world: World): Track | undefined {
  return world.tracks.find((t) => t.day);
}

/** The day train sets off now toward `leg`, on these budgets. */
function departDay(world: World, day: Track, leg: number, budgets: number[], now: number): World {
  const moved: Track = { ...day, train: { leg, departedAt: now }, day: day.day && { ...day.day, budgets } };
  return { ...world, tracks: world.tracks.map((t) => (t.id === day.id ? moved : t)) };
}

/**
 * The day's-end square: the day's last stop, which no project lists. The day never keeps a stop
 * alive, so anything else last on the day is only its last errand.
 */
export function isDayEnd(world: World, stopId: string): boolean {
  const day = dayTrack(world);
  if (!day || day.stops[day.stops.length - 1] !== stopId) return false;
  return !world.tracks.some((t) => !t.day && t.stops.includes(stopId));
}

/** The day track and its end square go; every stop it listed stays as it is, done or not. */
export function clearDay(world: World): World {
  const day = dayTrack(world);
  if (!day) return world;
  const end = day.stops[day.stops.length - 1];
  const dropEnd = end !== undefined && isDayEnd(world, end);
  return {
    ...world,
    tracks: world.tracks.filter((t) => t !== day),
    stops: dropEnd ? world.stops.filter((s) => s.id !== end) : world.stops,
    lastTouched: world.lastTouched === day.id ? null : world.lastTouched,
  };
}

/**
 * The day train never lags and never derives a pass-through: while the stop it heads for is done,
 * it sets off for the next one now, on a budget of the project time left to it at this moment
 * (0 for the end square, which no project lists). The same world back when nothing moved.
 */
export function settleDay(world: World, now: number): World {
  const day = dayTrack(world);
  if (!day?.day) return world;
  const done = new Set(world.stops.filter((s) => s.done).map((s) => s.id));
  let { leg } = day.train;
  if (leg >= day.stops.length || !done.has(day.stops[leg])) return world;
  const budgets = [...day.day.budgets];
  while (leg < day.stops.length && done.has(day.stops[leg])) {
    leg++;
    if (leg < day.stops.length) budgets[leg] = timeLeftAny(world, day.stops[leg], now);
  }
  return departDay(world, day, leg, budgets, now);
}

/**
 * The day line after the stop at `index` came off it: one budget per stop, the rest aligned by
 * index. The day train's leg moves by index alone, never by the project train's rebase; if the
 * stop was the one it headed for, it heads for the following one, its budget written by
 * `freshDayBudget` once the rest of the world has settled.
 */
export function dayWithout(day: Track, index: number): { track: Track; fresh: boolean } {
  const { leg } = day.train;
  const stops = day.stops.filter((_, i) => i !== index);
  const budgets = (day.day?.budgets ?? []).filter((_, i) => i !== index);
  const track: Track = {
    ...day,
    stops,
    train: { ...day.train, leg: index < leg ? leg - 1 : leg },
    day: day.day && { ...day.day, budgets },
  };
  return { track, fresh: index === leg };
}

/** The day train sets off now for the stop at its leg, on the project time left to it. */
export function freshDayBudget(world: World, now: number): World {
  const day = dayTrack(world);
  if (!day?.day) return world;
  const { leg } = day.train;
  if (leg >= day.stops.length) return world;
  const budgets = [...day.day.budgets];
  budgets[leg] = timeLeftAny(world, day.stops[leg], now);
  return departDay(world, day, leg, budgets, now);
}

/**
 * Undo of a stop the day train is past: it goes back to wait at that stop, budget 0. A finished
 * day is open again, so its end square is pending: only tapping it parks the day train.
 */
export function dayBackTo(world: World, stopId: string, now: number): World {
  const day = dayTrack(world);
  const index = day ? day.stops.indexOf(stopId) : -1;
  if (!day?.day || index < 0 || index >= day.train.leg) return world;
  const budgets = [...day.day.budgets];
  budgets[index] = 0;
  const end = day.stops[day.stops.length - 1];
  const reopened = isDayEnd(world, end)
    ? { ...world, stops: world.stops.map((s) => (s.id === end ? { ...s, done: false } : s)) }
    : world;
  return departDay(reopened, day, index, budgets, now);
}

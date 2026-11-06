import { timeLeftAny } from './train';
import type { Size, Stop, Track, World } from './types';

/** How long a stop's block is until the hand says otherwise, in seconds, by its size. */
export const DEFAULT_LENGTH: Record<Size, number> = { small: 1800, medium: 3600, large: 7200 };

export function defaultLength(stop: Pick<Stop, 'size'> | undefined): number {
  return DEFAULT_LENGTH[stop?.size ?? 'medium'];
}

/** Every day line, in the order the world keeps them. */
export function days(world: World): Track[] {
  return world.tracks.filter((t) => t.day);
}

/** The day line for this date, if there is one. */
export function dayFor(world: World, date: string): Track | undefined {
  return world.tracks.find((t) => t.day?.date === date);
}

/** The day line that lists this stop, if any: a stop sits on at most one. */
export function dayWith(world: World, stopId: string): Track | undefined {
  return world.tracks.find((t) => t.day && t.stops.includes(stopId));
}

/** The day train sets off now toward `leg`, on these budgets. */
function departDay(world: World, day: Track, leg: number, budgets: number[], now: number): World {
  const moved: Track = { ...day, train: { leg, departedAt: now }, day: day.day && { ...day.day, budgets } };
  return { ...world, tracks: world.tracks.map((t) => (t.id === day.id ? moved : t)) };
}

/**
 * A day's-end square: some day's last stop, which no project lists. The day never keeps a stop
 * alive, so anything else last on a day is only its last errand.
 */
export function isDayEnd(world: World, stopId: string): boolean {
  const day = dayWith(world, stopId);
  if (!day || day.stops[day.stops.length - 1] !== stopId) return false;
  return !world.tracks.some((t) => !t.day && t.stops.includes(stopId));
}

/** The day track and its end square go; every stop it listed stays as it is, done or not. */
export function clearDay(world: World, dayId: string): World {
  const day = world.tracks.find((t) => t.id === dayId && t.day);
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
 * A running day train never lags and never derives a pass-through: while the stop it heads for is
 * done, it sets off for the next one now, on a budget of the project time left to it at this
 * moment (0 for the end square, which no project lists). A held day waits for its day to begin.
 * The same world back when nothing moved.
 */
export function settleDay(world: World, now: number): World {
  let settled = world;
  for (const day of days(world)) {
    if (!day.day || day.day.held) continue;
    const done = new Set(settled.stops.filter((s) => s.done).map((s) => s.id));
    let { leg } = day.train;
    if (leg >= day.stops.length || !done.has(day.stops[leg])) continue;
    const budgets = [...day.day.budgets];
    while (leg < day.stops.length && done.has(day.stops[leg])) {
      leg++;
      if (leg < day.stops.length) budgets[leg] = timeLeftAny(settled, day.stops[leg], now);
    }
    settled = departDay(settled, day, leg, budgets, now);
  }
  return settled;
}

/**
 * The day line after the stop at `index` came off it: one budget and one length per stop, the rest
 * aligned by index. The day train's leg moves by index alone, never by the project train's rebase;
 * if the stop was the one it headed for, it heads for the following one, its budget written by
 * `freshDayBudget` once the rest of the world has settled.
 */
export function dayWithout(day: Track, index: number): { track: Track; fresh: boolean } {
  const { leg } = day.train;
  const keep = (_: unknown, i: number) => i !== index;
  const track: Track = {
    ...day,
    stops: day.stops.filter(keep),
    train: { ...day.train, leg: index < leg ? leg - 1 : leg },
    day: day.day && { ...day.day, budgets: day.day.budgets.filter(keep), lengths: day.day.lengths.filter(keep) },
  };
  return { track, fresh: index === leg };
}

/** A running day train sets off now for the stop at its leg, on the project time left to it. */
export function freshDayBudget(world: World, dayId: string, now: number): World {
  const day = world.tracks.find((t) => t.id === dayId);
  if (!day?.day || day.day.held) return world;
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
  const day = dayWith(world, stopId);
  const index = day ? day.stops.indexOf(stopId) : -1;
  if (!day?.day || day.day.held || index < 0 || index >= day.train.leg) return world;
  const budgets = [...day.day.budgets];
  budgets[index] = 0;
  const end = day.stops[day.stops.length - 1];
  const reopened = isDayEnd(world, end)
    ? { ...world, stops: world.stops.map((s) => (s.id === end ? { ...s, done: false } : s)) }
    : world;
  return departDay(reopened, day, index, budgets, now);
}

/**
 * Takes these stops off every day line but `keep`: a stop sits on one day at most. A day left
 * with nothing but its end square goes, square and all.
 */
export function offOtherDays(world: World, stopIds: readonly string[], now: number, keep?: string): World {
  let w = world;
  for (const id of stopIds) {
    const day = dayWith(w, id);
    if (!day || day.id === keep || isDayEnd(w, id)) continue;
    const off = dayWithout(day, day.stops.indexOf(id));
    w = { ...w, tracks: w.tracks.map((t) => (t.id === day.id ? off.track : t)) };
    const end = off.track.stops[off.track.stops.length - 1];
    if (off.track.stops.length === 1 && end !== undefined && isDayEnd(w, end)) w = clearDay(w, day.id);
    else if (off.fresh) w = freshDayBudget(w, day.id, now);
  }
  return w;
}

/**
 * A held day whose date has come begins: its train sets off now for its first pending stop, on
 * the project time left to it.
 */
export function startDay(world: World, dayId: string, now: number): World {
  const day = world.tracks.find((t) => t.id === dayId);
  if (!day?.day?.held) return world;
  const done = new Set(world.stops.filter((s) => s.done).map((s) => s.id));
  let leg = 0;
  while (leg < day.stops.length && done.has(day.stops[leg])) leg++;
  const { held: _, ...plan } = day.day;
  const budgets = [...plan.budgets];
  if (leg < day.stops.length) budgets[leg] = timeLeftAny(world, day.stops[leg], now);
  const started: Track = { ...day, train: { leg, departedAt: now }, day: { ...plan, budgets } };
  return { ...world, tracks: world.tracks.map((t) => (t.id === dayId ? started : t)) };
}

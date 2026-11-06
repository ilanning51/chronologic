import { defaultLength } from '../model/day';
import { lifeOf } from '../model/life';
import { EMPTY } from '../model/reducer';
import { DAY } from '../plane/grid';
import type { BubbleTarget, Shape, Size, Stop, Track, World } from '../model/types';

/**
 * Bump the version in the key when the shape of World changes; an old world opens as empty unless
 * it is read on purpose, as v3 and v2 are. An older build reading a newer world would refuse it and
 * open empty, which is why the key moves rather than the shape changing under it.
 */
export const STORAGE_KEY = 'chronologic.v5';
/** A v4 world has no life line; it is read and given an empty one. */
export const V4_KEY = 'chronologic.v4';
/** A v3 world has at most one day line and no block lengths; it is read and given them. */
export const V3_KEY = 'chronologic.v3';
/** A v2 world is a v3 world with no day track and no shared stops, so it is read once and kept. */
export const V2_KEY = 'chronologic.v2';
/** A v5 world that fails validation is kept here, once, so the empty world's next save cannot overwrite it. */
export const REFUSED_KEY = 'chronologic.v5.refused';

const SHAPES: readonly Shape[] = ['circle', 'triangle', 'square'];
const SIZES: readonly Size[] = ['small', 'medium', 'large'];
const TARGETS: readonly BubbleTarget[] = ['next', 'subgoal', 'goal'];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function isNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isStop(v: unknown): v is Stop {
  return (
    isRecord(v) &&
    typeof v.id === 'string' &&
    typeof v.title === 'string' &&
    SHAPES.includes(v.shape as Shape) &&
    SIZES.includes(v.size as Size) &&
    isNumber(v.x) &&
    isNumber(v.y) &&
    typeof v.done === 'boolean' &&
    (v.doneAt === undefined || isNumber(v.doneAt)) &&
    (v.image === undefined || (typeof v.image === 'string' && v.image.startsWith('data:image/')))
  );
}

function isPerStop(v: unknown, stopCount: number): boolean {
  return Array.isArray(v) && v.length === stopCount && v.every(isNumber);
}

/**
 * A day track's date is a string and it has one finite budget per stop, and one block length per
 * stop unless it was saved before blocks had lengths. Held and placed, where present, are true.
 */
function isDay(v: unknown, stopCount: number): boolean {
  return (
    isRecord(v) &&
    typeof v.date === 'string' &&
    isPerStop(v.budgets, stopCount) &&
    (v.lengths === undefined || isPerStop(v.lengths, stopCount)) &&
    (v.held === undefined || v.held === true) &&
    (v.placed === undefined || v.placed === true)
  );
}

/**
 * A track is trusted when it names real stops once each, its train is on the line, and a project
 * ends in a square. The life line may be empty, lists only squares, and has a height and one budget
 * per stop.
 */
function isTrack(v: unknown, shapes: ReadonlyMap<string, Shape>): v is Track {
  if (!isRecord(v) || typeof v.id !== 'string') return false;
  if (!Number.isInteger(v.color) || (v.color as number) < 0) return false;
  if (!isRecord(v.origin) || !isNumber(v.origin.x) || !isNumber(v.origin.y)) return false;
  if (!TARGETS.includes(v.target as BubbleTarget)) return false;
  const { stops, train } = v;
  if (!Array.isArray(stops)) return false;
  if (!stops.every((id) => typeof id === 'string' && shapes.has(id))) return false;
  if (new Set(stops).size !== stops.length) return false;
  if (v.life !== undefined) {
    if (v.day !== undefined || !isRecord(v.life) || !isNumber(v.life.y) || !isPerStop(v.life.budgets, stops.length)) return false;
    if (!stops.every((id) => shapes.get(id) === 'square')) return false;
  } else if (stops.length === 0 || shapes.get(stops[stops.length - 1]) !== 'square') return false;
  if (v.day !== undefined && !isDay(v.day, stops.length)) return false;
  return (
    isRecord(train) &&
    Number.isInteger(train.leg) &&
    (train.leg as number) >= 0 &&
    (train.leg as number) <= stops.length &&
    isNumber(train.departedAt)
  );
}

/**
 * Across tracks: at most one life line. Every square a project or day lists is last on exactly one
 * of them, its home, since a goal may sit mid-line on another track; a square only the life line
 * lists is a marker and has none. One day track per date at most, and each day's end square is on
 * no other track.
 */
function tracksAgree(tracks: readonly Track[], shapes: ReadonlyMap<string, Shape>): boolean {
  if (tracks.filter((t) => t.life).length > 1) return false;
  const homes = new Map<string, number>();
  for (const t of tracks) {
    if (t.life) continue;
    const last = t.stops[t.stops.length - 1];
    homes.set(last, (homes.get(last) ?? 0) + 1);
  }
  for (const t of tracks) {
    if (t.life) {
      if (t.stops.some((id) => (homes.get(id) ?? 0) > 1)) return false;
      continue;
    }
    for (const id of t.stops) {
      if (shapes.get(id) === 'square' && homes.get(id) !== 1) return false;
    }
  }
  const days = tracks.filter((t) => t.day !== undefined);
  if (new Set(days.map((t) => t.day!.date)).size !== days.length) return false;
  return days.every((day) => {
    const end = day.stops[day.stops.length - 1];
    return !tracks.some((t) => t !== day && t.stops.includes(end));
  });
}

function isWorld(v: unknown): v is World {
  if (!isRecord(v) || !Array.isArray(v.tracks) || !Array.isArray(v.stops)) return false;
  if (!(v.lastTouched === null || typeof v.lastTouched === 'string')) return false;
  if (!v.stops.every(isStop)) return false;
  const shapes = new Map<string, Shape>(v.stops.map((s: Stop) => [s.id, s.shape]));
  return v.tracks.every((t) => isTrack(t, shapes)) && tracksAgree(v.tracks as Track[], shapes);
}

/** A day saved before blocks had lengths gets each stop's default, so every day carries them. */
function withLengths(world: World): World {
  if (world.tracks.every((t) => !t.day || t.day.lengths)) return world;
  const byId = new Map(world.stops.map((s) => [s.id, s]));
  return {
    ...world,
    tracks: world.tracks.map((t) =>
      t.day && !t.day.lengths ? { ...t, day: { ...t.day, lengths: t.stops.map((id) => defaultLength(byId.get(id))) } } : t,
    ),
  };
}

/**
 * The world with a life line: its own when it has one, else an empty one below everything, a day of
 * world units under the lowest stop and starting at the leftmost, or through the origin for a world
 * with no stops. It goes first, so it draws under the project lines. Run on what `load` returns, never
 * in the reducer, which would re-run it after undo.
 */
export function ensureLife(world: World, now: number): World {
  if (lifeOf(world)) return world;
  const ys = world.stops.map((s) => s.y);
  const y = ys.length === 0 ? 0 : Math.max(...ys) + DAY;
  const x = world.stops.length === 0 ? 0 : Math.min(...world.stops.map((s) => s.x));
  const life: Track = {
    id: 'life',
    // newTrack colours by the count of projects, so this one never shifts the lines after it.
    color: 0,
    origin: { x, y },
    stops: [],
    train: { leg: 0, departedAt: now },
    target: 'next',
    life: { y, budgets: [] },
  };
  return { ...world, tracks: [life, ...world.tracks] };
}

/**
 * The saved world, or a fresh one when nothing is saved or what is saved cannot be trusted; either
 * way it has a life line. Read order is v5, v4, v3, v2; the next save writes v5, and the older keys
 * are never touched. A v5 world that is refused is first copied to the refused key unless that key
 * already holds one, so nothing made later can overwrite it.
 */
export function load(storage: Pick<Storage, 'getItem' | 'setItem'>, now: number): World {
  try {
    const current = storage.getItem(STORAGE_KEY);
    const raw = current ?? storage.getItem(V4_KEY) ?? storage.getItem(V3_KEY) ?? storage.getItem(V2_KEY);
    if (!raw) return ensureLife(EMPTY, now);
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = undefined;
    }
    if (isWorld(parsed)) return ensureLife(withLengths(parsed), now);
    if (current !== null && storage.getItem(REFUSED_KEY) === null) storage.setItem(REFUSED_KEY, current);
    return ensureLife(EMPTY, now);
  } catch {
    return ensureLife(EMPTY, now);
  }
}

/** Writes the world. A storage that refuses is left alone; the plane stays in memory. */
export function save(storage: Pick<Storage, 'setItem'>, world: World): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(world));
  } catch {
    // Private mode or a full quota. Nothing to tell the person, as the rule is no interruptions.
  }
}

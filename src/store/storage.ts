import { defaultLength } from '../model/day';
import { EMPTY } from '../model/reducer';
import type { BubbleTarget, Shape, Size, Stop, Track, World } from '../model/types';

/**
 * Bump the version in the key when the shape of World changes; an old world opens as empty unless
 * it is read on purpose, as v3 and v2 are. An older build reading a newer world would refuse it and
 * open empty, which is why the key moves rather than the shape changing under it.
 */
export const STORAGE_KEY = 'chronologic.v4';
/** A v3 world has at most one day line and no block lengths; it is read and given them. */
export const V3_KEY = 'chronologic.v3';
/** A v2 world is a v3 world with no day track and no shared stops, so it is read once and kept. */
export const V2_KEY = 'chronologic.v2';

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

/** A track is trusted when it names real stops once each, ends in a square, and its train is on the line. */
function isTrack(v: unknown, shapes: ReadonlyMap<string, Shape>): v is Track {
  if (!isRecord(v) || typeof v.id !== 'string') return false;
  if (!Number.isInteger(v.color) || (v.color as number) < 0) return false;
  if (!isRecord(v.origin) || !isNumber(v.origin.x) || !isNumber(v.origin.y)) return false;
  if (!TARGETS.includes(v.target as BubbleTarget)) return false;
  const { stops, train } = v;
  if (!Array.isArray(stops) || stops.length === 0) return false;
  if (!stops.every((id) => typeof id === 'string' && shapes.has(id))) return false;
  if (new Set(stops).size !== stops.length) return false;
  if (shapes.get(stops[stops.length - 1]) !== 'square') return false;
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
 * Across tracks: every square a track lists is last on exactly one track, its home, since a goal
 * may sit mid-line on another track. One day track per date at most, and each day's end square is
 * on no other track.
 */
function tracksAgree(tracks: readonly Track[], shapes: ReadonlyMap<string, Shape>): boolean {
  const homes = new Map<string, number>();
  for (const t of tracks) {
    const last = t.stops[t.stops.length - 1];
    homes.set(last, (homes.get(last) ?? 0) + 1);
  }
  for (const t of tracks) {
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
 * The saved world, or an empty one when nothing is saved or what is saved cannot be trusted. With
 * no v4 world, a v3 or else a v2 one is read instead; the next save writes v4, and the older keys
 * are never touched.
 */
export function load(storage: Pick<Storage, 'getItem'>): World {
  try {
    const raw = storage.getItem(STORAGE_KEY) ?? storage.getItem(V3_KEY) ?? storage.getItem(V2_KEY);
    if (!raw) return EMPTY;
    const parsed: unknown = JSON.parse(raw);
    return isWorld(parsed) ? withLengths(parsed) : EMPTY;
  } catch {
    return EMPTY;
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

import { EMPTY } from '../model/reducer';
import type { BubbleTarget, Shape, Size, Stop, Track, World } from '../model/types';

/** Bump the version in the key when the shape of World changes; an old world then opens as empty. */
export const STORAGE_KEY = 'chronologic.v2';

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
    typeof v.done === 'boolean'
  );
}

/** A track is trusted when it names real stops once each, ends in a square and has no other, and its train is on the line. */
function isTrack(v: unknown, shapes: ReadonlyMap<string, Shape>): v is Track {
  if (!isRecord(v) || typeof v.id !== 'string') return false;
  if (!Number.isInteger(v.color) || (v.color as number) < 0) return false;
  if (!isRecord(v.origin) || !isNumber(v.origin.x) || !isNumber(v.origin.y)) return false;
  if (!TARGETS.includes(v.target as BubbleTarget)) return false;
  const { stops, train } = v;
  if (!Array.isArray(stops) || stops.length === 0) return false;
  if (!stops.every((id) => typeof id === 'string' && shapes.has(id))) return false;
  if (new Set(stops).size !== stops.length) return false;
  const last = stops.length - 1;
  if (!stops.every((id, i) => (shapes.get(id) === 'square') === (i === last))) return false;
  return (
    isRecord(train) &&
    Number.isInteger(train.leg) &&
    (train.leg as number) >= 0 &&
    (train.leg as number) <= stops.length &&
    isNumber(train.departedAt)
  );
}

function isWorld(v: unknown): v is World {
  if (!isRecord(v) || !Array.isArray(v.tracks) || !Array.isArray(v.stops)) return false;
  if (!(v.lastTouched === null || typeof v.lastTouched === 'string')) return false;
  if (!v.stops.every(isStop)) return false;
  const shapes = new Map<string, Shape>(v.stops.map((s: Stop) => [s.id, s.shape]));
  return v.tracks.every((t) => isTrack(t, shapes));
}
/** The saved world, or an empty one when nothing is saved or what is saved cannot be trusted. */
export function load(storage: Pick<Storage, 'getItem'>): World {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed: unknown = JSON.parse(raw);
    return isWorld(parsed) ? parsed : EMPTY;
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

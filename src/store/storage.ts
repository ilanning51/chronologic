import { EMPTY } from '../model/reducer';
import type { Kind, Length, Shape, Station, Stretch, World } from '../model/types';

/** Bump the version in the key when the shape of World changes; an old world then opens as empty. */
export const STORAGE_KEY = 'chronologic.v1';

const SHAPES: readonly Shape[] = ['circle', 'triangle', 'square'];
const KINDS: readonly Kind[] = ['deep', 'shallow', 'body', 'out'];
const LENGTHS: readonly Length[] = ['hour', 'couple', 'half', 'whole'];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function isStation(v: unknown): v is Station {
  return (
    isRecord(v) &&
    typeof v.id === 'string' &&
    typeof v.title === 'string' &&
    SHAPES.includes(v.shape as Shape) &&
    typeof v.x === 'number' &&
    typeof v.y === 'number' &&
    v.z === 0 &&
    typeof v.done === 'boolean'
  );
}

function isStretch(v: unknown): v is Stretch {
  return (
    isRecord(v) &&
    KINDS.includes(v.kind as Kind) &&
    LENGTHS.includes(v.length as Length) &&
    typeof v.name === 'string' &&
    typeof v.startedAt === 'number' &&
    Array.isArray(v.line) &&
    v.line.every((id) => typeof id === 'string')
  );
}

function isWorld(v: unknown): v is World {
  return (
    isRecord(v) &&
    Array.isArray(v.stations) &&
    v.stations.every(isStation) &&
    (v.stretch === null || isStretch(v.stretch)) &&
    LENGTHS.includes(v.lastLength as Length)
  );
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

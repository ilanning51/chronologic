import { EMPTY } from '../model/reducer';
import type { World } from '../model/types';

/** Bump the version in the key when the shape of World changes; an old world then opens as empty. */
export const STORAGE_KEY = 'chronologic.v2';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function isWorld(v: unknown): v is World {
  return (
    isRecord(v) &&
    Array.isArray(v.tracks) &&
    Array.isArray(v.stops) &&
    (v.lastTouched === null || typeof v.lastTouched === 'string')
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

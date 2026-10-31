import type { World } from './types';

/** No actions yet; the v2 actions arrive with the tasks that need them. */
export type Action = never;

export const EMPTY: World = { tracks: [], stops: [], lastTouched: null };

export function reduce(world: World, _action: Action): World {
  return world;
}

import type { Shape, Station } from './types';

/** World units between stations that slide to the front. */
export const STATION_GAP = 64;

/** How many circles a shape splits into: the shape's minutes over a circle's, rounded down. */
export const SPLIT_PIECES: Record<Shape, number> = { circle: 1, triangle: 2, square: 4 };

/**
 * Moves the given stations to the front of the plane, left of everything else, keeping
 * their order and their vertical positions. Nothing records that this happened.
 */
export function slideToFront(stations: Station[], ids: string[]): Station[] {
  if (ids.length === 0) return stations;
  const sliding = new Set(ids);
  const others = stations.filter((s) => !sliding.has(s.id));
  const front = others.length > 0 ? Math.min(...others.map((s) => s.x)) : 0;
  return stations.map((s) =>
    sliding.has(s.id) ? { ...s, x: front - STATION_GAP * (ids.length - ids.indexOf(s.id)) } : s,
  );
}

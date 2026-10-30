import { distance, type Point } from './geometry';

/** World units a new station keeps clear of the ones already there. */
export const CLEAR_RADIUS = 48;

/**
 * Where a captured station lands: the center of the view, nudged right by one radius
 * at a time until nothing already there is within a radius of it.
 */
export function placeClear(center: Point, taken: Point[]): Point {
  let at = center;
  while (taken.some((p) => distance(p, at) < CLEAR_RADIUS)) {
    at = { x: at.x + CLEAR_RADIUS, y: at.y };
  }
  return at;
}

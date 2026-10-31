import { distance, type Point } from './geometry';

/**
 * Where a captured station lands: the center of the view, nudged right by one radius
 * at a time until nothing already there is within a radius of it. The radius is in world
 * units, so the caller sets how much room a station needs at the current zoom.
 */
export function placeClear(center: Point, taken: Point[], radius: number): Point {
  let at = center;
  while (taken.some((p) => distance(p, at) < radius)) {
    at = { x: at.x + radius, y: at.y };
  }
  return at;
}

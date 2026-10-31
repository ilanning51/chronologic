import type { Point } from './geometry';

/** How far past the viewport, in screen pixels, a segment is kept before it is cut. */
export const CLIP_MARGIN_PX = 200;

/**
 * Cuts a segment to a rectangle (Liang-Barsky), or returns null when none of it is inside.
 * A month of track at full zoom is a billion pixels long; cut to the rectangle it keeps its
 * slope and stays a size the renderer can draw.
 */
export function clipSegment(a: Point, b: Point, rect: { x: number; y: number; w: number; h: number }): [Point, Point] | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let t0 = 0;
  let t1 = 1;
  const edges: [number, number][] = [
    [-dx, a.x - rect.x],
    [dx, rect.x + rect.w - a.x],
    [-dy, a.y - rect.y],
    [dy, rect.y + rect.h - a.y],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return null;
      continue;
    }
    const r = q / p;
    if (p < 0) {
      if (r > t1) return null;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return null;
      if (r < t1) t1 = r;
    }
  }
  const at = (t: number): Point => ({ x: a.x + t * dx, y: a.y + t * dy });
  return [t0 === 0 ? a : at(t0), t1 === 1 ? b : at(t1)];
}

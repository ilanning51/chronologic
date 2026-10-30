import { distance, type Point } from './geometry';

/** World units the line begins before its first station. */
export const LEAD = 40;
/** World units the line runs past its last reached station before the terminus bar. */
export const TERMINUS_OVERRUN = 32;

export interface Route {
  /** Polyline vertices, horizontal, vertical and 45 degree segments only. */
  vertices: Point[];
  /** stationAt[i] is the vertex index of station i. */
  stationAt: number[];
}

/** Degrees of the segment from a to b, snapped where it lands on a whole number. */
function angleOf(a: Point, b: Point): number {
  const degrees = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  const rounded = Math.round(degrees);
  return Math.abs(degrees - rounded) < 1e-9 ? rounded : degrees;
}

/**
 * Routes a line through stations the way the subway map does: between two stations a
 * 45 degree segment first, covering the shorter axis, then a straight run for the rest.
 */
export function routeThrough(points: Point[]): Route {
  if (points.length === 0) return { vertices: [], stationAt: [] };
  const first = points[0];
  const vertices: Point[] = [{ x: first.x - LEAD, y: first.y }, first];
  const stationAt = [1];
  for (let i = 1; i < points.length; i++) {
    const from = points[i - 1];
    const to = points[i];
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const diagonal = Math.min(Math.abs(dx), Math.abs(dy));
    if (diagonal > 0 && Math.abs(dx) !== Math.abs(dy)) {
      vertices.push({ x: from.x + Math.sign(dx) * diagonal, y: from.y + Math.sign(dy) * diagonal });
    }
    vertices.push(to);
    stationAt.push(vertices.length - 1);
  }
  return { vertices, stationAt };
}

/** The point a fraction of the way along the route between two vertex indices. */
export function pointAlong(vertices: Point[], from: number, to: number, fraction: number): { at: Point; angle: number } {
  if (to <= from) return { at: vertices[from], angle: 0 };
  const lengths: number[] = [];
  let total = 0;
  for (let i = from; i < to; i++) {
    const length = distance(vertices[i], vertices[i + 1]);
    lengths.push(length);
    total += length;
  }
  let target = Math.min(1, Math.max(0, fraction)) * total;
  for (let i = from; i < to; i++) {
    const length = lengths[i - from];
    if (target <= length || i === to - 1) {
      const t = length === 0 ? 0 : Math.min(1, target / length);
      const a = vertices[i];
      const b = vertices[i + 1];
      return { at: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, angle: angleOf(a, b) };
    }
    target -= length;
  }
  return { at: vertices[to], angle: 0 };
}

/** Where the terminus bar sits: past the last station, continuing the way the line came in. */
export function terminusOf(route: Route): { at: Point; angle: number } {
  const last = route.stationAt[route.stationAt.length - 1];
  const end = route.vertices[last];
  const before = route.vertices[last - 1];
  const length = distance(before, end);
  const dir = length === 0 ? { x: 1, y: 0 } : { x: (end.x - before.x) / length, y: (end.y - before.y) / length };
  return { at: { x: end.x + dir.x * TERMINUS_OVERRUN, y: end.y + dir.y * TERMINUS_OVERRUN }, angle: angleOf(before, end) };
}

/** Where the train sits: halfway along the route before the next pending station. */
export function trainOn(route: Route, nextIndex: number): { at: Point; angle: number } {
  if (route.stationAt.length === 0) return { at: { x: 0, y: 0 }, angle: 0 };
  const index = Math.min(nextIndex, route.stationAt.length - 1);
  const from = index === 0 ? 0 : route.stationAt[index - 1];
  const to = route.stationAt[index];
  return pointAlong(route.vertices, from, to, 0.5);
}

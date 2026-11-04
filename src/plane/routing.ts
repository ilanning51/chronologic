import { distance, type Point } from './geometry';

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
 * The first vertex is the first station itself; nothing is drawn before it.
 */
export function routeThrough(points: Point[]): Route {
  if (points.length === 0) return { vertices: [], stationAt: [] };
  const vertices: Point[] = [points[0]];
  const stationAt = [0];
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

/**
 * The route cut where a train sits: `seconds` along the leg between vertex `from` and vertex
 * `to`. `behind` runs from the first vertex to the cut, the road travelled; `ahead` from the cut
 * to the last, the road still to come. A cut on a vertex is not repeated, so neither half has a
 * segment of no length.
 */
export function cutAt(vertices: Point[], from: number, to: number, seconds: number): { behind: Point[]; ahead: Point[] } {
  let remaining = Math.max(0, seconds);
  for (let i = from; i < to; i++) {
    const length = distance(vertices[i], vertices[i + 1]);
    if (remaining <= length || i === to - 1) {
      const t = length === 0 ? 0 : Math.min(1, remaining / length);
      const a = vertices[i];
      const b = vertices[i + 1];
      if (t === 0) return { behind: vertices.slice(0, i + 1), ahead: vertices.slice(i) };
      if (t === 1) return { behind: vertices.slice(0, i + 2), ahead: vertices.slice(i + 1) };
      const at = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      return { behind: [...vertices.slice(0, i + 1), at], ahead: [at, ...vertices.slice(i + 1)] };
    }
    remaining -= length;
  }
  // A leg with no road: the cut is its one vertex.
  return { behind: vertices.slice(0, from + 1), ahead: vertices.slice(from) };
}

/** The length of the route between two vertex indices, following every segment. */
export function pathLength(vertices: Point[], from: number, to: number): number {
  let total = 0;
  for (let i = from; i < to; i++) total += distance(vertices[i], vertices[i + 1]);
  return total;
}

/** The vertex indices of the leg from station leg to station leg + 1. */
export function legSpan(route: Route, leg: number): { from: number; to: number } {
  return { from: route.stationAt[leg], to: route.stationAt[leg + 1] };
}

/**
 * The closest point on the route to p. Each leg is searched segment by segment; the foot
 * of the perpendicular is clamped to the segment. offset is the path distance from the
 * leg's first vertex to that point, dist the straight-line distance from p to it.
 * On a tie the earlier leg wins.
 */
export function nearestOnRoute(route: Route, p: Point): { leg: number; offset: number; at: Point; dist: number } {
  const { vertices, stationAt } = route;
  if (stationAt.length < 2) return { leg: 0, offset: 0, at: vertices[0], dist: distance(p, vertices[0]) };
  let best: { leg: number; offset: number; at: Point; dist: number } | null = null;
  for (let leg = 0; leg < stationAt.length - 1; leg++) {
    const span = legSpan(route, leg);
    let travelled = 0;
    for (let i = span.from; i < span.to; i++) {
      const a = vertices[i];
      const b = vertices[i + 1];
      const length = distance(a, b);
      const projected = length === 0 ? 0 : ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / (length * length);
      const t = Math.min(1, Math.max(0, projected));
      const at = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      const dist = distance(p, at);
      if (best === null || dist < best.dist) best = { leg, offset: travelled + length * t, at, dist };
      travelled += length;
    }
  }
  return best!;
}

import { drawnOnPlane } from '../model/day';
import type { World } from '../model/types';
import type { Point } from './geometry';

/** An axis-aligned rectangle, in whatever space its corners are in. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** What a box caught: stop ids, and the ids of the tracks whose start is inside. */
export interface Selection {
  stops: string[];
  origins: string[];
}

/** The rectangle between any two corners, however they are given. */
export function rectOf(a: Point, b: Point): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
}

function inside(p: Point, r: Rect): boolean {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

/**
 * Everything whose point is in the box, edges included: the box is geometry, so a stop hidden
 * by the level counts as much as a drawn one. A day line the plane does not draw, further ahead
 * than tomorrow, is not there to catch: neither its start nor a stop only it lists. The life
 * line's squares are caught, its start never: it is not drawn or moved. Null when it caught nothing.
 */
export function pick(world: World, box: Rect, today: string): Selection | null {
  const onPlane = (id: string) => world.tracks.some((t) => t.stops.includes(id) && drawnOnPlane(t, today));
  const stops = world.stops.filter((s) => inside(s, box) && onPlane(s.id)).map((s) => s.id);
  const origins = world.tracks.filter((t) => !t.life && inside(t.origin, box) && drawnOnPlane(t, today)).map((t) => t.id);
  return stops.length === 0 && origins.length === 0 ? null : { stops, origins };
}

/** The points a selection still names, in the world's order. */
function pointsOf(world: World, s: Selection): Point[] {
  const stops = world.stops.filter((stop) => s.stops.includes(stop.id));
  const origins = world.tracks.filter((t) => s.origins.includes(t.id)).map((t) => t.origin);
  return [...stops, ...origins];
}

/** The bounds of what the selection still names, or null once nothing is left. */
export function bounds(world: World, s: Selection): Rect | null {
  const points = pointsOf(world, s);
  if (points.length === 0) return null;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/** The selection without ids the world no longer has, or null once it names nothing. */
export function prune(world: World, s: Selection): Selection | null {
  const stops = s.stops.filter((id) => world.stops.some((stop) => stop.id === id));
  const origins = s.origins.filter((id) => world.tracks.some((t) => t.id === id));
  return stops.length === 0 && origins.length === 0 ? null : { stops, origins };
}

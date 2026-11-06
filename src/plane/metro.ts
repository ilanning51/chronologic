import type { TrainState } from '../model/train';
import type { Track, World } from '../model/types';
import type { Point } from './geometry';
import { type Bend, bendOf, legSpan, pathLength, pointAlong, type Route, routeThrough } from './routing';

/*
 * The map as Vignelli drew it, worked out for the whole world at once, since where one line goes
 * depends on where the others are. Each leg's one bend can sit at either end, at the same length
 * and so the same time; this picks, leg by leg, the end that crosses the fewest other lines.
 */

const BENDS: Bend[] = ['diagonal-first', 'straight-first'];

/** How many times the legs are revisited; a second pass lets an early leg answer a later one. */
const PASSES = 2;

/** A leg that keeps company with another line between the same two stops, but bends apart from it. */
const PARTING = 0.5;

interface Leg {
  track: number;
  leg: number;
  from: Point;
  to: Point;
  segments: [Point, Point][];
  corner: Point | null;
}

const near = (a: Point, b: Point) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y) <= 1e-6 * (1 + Math.abs(a.x) + Math.abs(a.y));

const cross = (ax: number, ay: number, bx: number, by: number) => ax * by - ay * bx;

/** Where segment pq meets segment rs, or null. Runs that lie along each other share a road; they do not cross. */
function meet(p: Point, q: Point, r: Point, s: Point): Point | null {
  const d1x = q.x - p.x;
  const d1y = q.y - p.y;
  const d2x = s.x - r.x;
  const d2y = s.y - r.y;
  const den = cross(d1x, d1y, d2x, d2y);
  if (den === 0) return null;
  const t = cross(r.x - p.x, r.y - p.y, d2x, d2y) / den;
  const u = cross(r.x - p.x, r.y - p.y, d1x, d1y) / den;
  const slack = 1e-9;
  if (t < -slack || t > 1 + slack || u < -slack || u > 1 + slack) return null;
  return { x: p.x + t * d1x, y: p.y + t * d1y };
}

/** Whether point s lies on segment ab, short of its ends. */
function onSegment(s: Point, a: Point, b: Point): boolean {
  if (near(s, a) || near(s, b)) return false;
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  if (length === 0) return false;
  const off = Math.abs(cross(b.x - a.x, b.y - a.y, s.x - a.x, s.y - a.y)) / length;
  const along = ((s.x - a.x) * (b.x - a.x) + (s.y - a.y) * (b.y - a.y)) / (length * length);
  return off <= 1e-6 * (1 + length) && along > 0 && along < 1;
}

function legOf(track: number, leg: number, from: Point, to: Point, bend: Bend): Leg {
  const corner = bendOf(from, to, bend);
  const segments: [Point, Point][] = corner
    ? [
        [from, corner],
        [corner, to],
      ]
    : [[from, to]];
  return { track, leg, from, to, segments, corner };
}

/**
 * What a leg costs where it is: one for each other line it crosses away from its own two stops,
 * one for each stop it runs through that it does not serve, and a little for parting from a line
 * that runs between the same two stops.
 */
function costOf(leg: Leg, others: Leg[], stops: Point[]): number {
  let cost = 0;
  for (const other of others) {
    const twin = (near(other.from, leg.from) && near(other.to, leg.to)) || (near(other.from, leg.to) && near(other.to, leg.from));
    if (twin) {
      const same = other.corner === null || leg.corner === null ? other.corner === leg.corner : near(other.corner, leg.corner);
      if (!same) cost += PARTING;
      continue;
    }
    for (const [p, q] of leg.segments) {
      for (const [r, s] of other.segments) {
        const at = meet(p, q, r, s);
        if (at && !near(at, leg.from) && !near(at, leg.to)) cost += 1;
      }
    }
  }
  for (const stop of stops) {
    if (leg.segments.some(([a, b]) => onSegment(stop, a, b))) cost += 1;
  }
  return cost;
}

/** For every track, which end of each leg its bend sits at. A leg keeps the diagonal first unless the other end is strictly better. */
export function chooseBends(world: World): Map<string, Bend[]> {
  const byId = new Map(world.stops.map((s) => [s.id, s]));
  const points = world.tracks.map((t) => [t.origin, ...t.stops.map((id) => byId.get(id)!)]);
  const bends: Bend[][] = points.map((p) => p.slice(1).map((): Bend => 'diagonal-first'));
  const legs: Leg[][] = points.map((p, track) => bends[track].map((bend, leg) => legOf(track, leg, p[leg], p[leg + 1], bend)));
  const stops = world.stops.map((s) => ({ x: s.x, y: s.y }));

  for (let pass = 0; pass < PASSES; pass++) {
    let moved = false;
    for (let track = 0; track < legs.length; track++) {
      for (let leg = 0; leg < legs[track].length; leg++) {
        const here = legs[track][leg];
        if (here.corner === null) continue;
        const others = legs.flat().filter((l) => l !== here);
        const other = BENDS.find((b) => b !== bends[track][leg])!;
        const there = legOf(track, leg, here.from, here.to, other);
        if (costOf(there, others, stops) < costOf(here, others, stops)) {
          bends[track][leg] = other;
          legs[track][leg] = there;
          moved = true;
        }
      }
    }
    if (!moved) break;
  }
  return new Map(world.tracks.map((t, i) => [t.id, bends[i]]));
}

/** Everything the routes depend on, and nothing else: where each line starts, its stops, and where they are. */
function shapeKey(world: World): string {
  const lines = world.tracks.map((t) => `${t.id}@${t.origin.x},${t.origin.y}:${t.stops.join(',')}`).join('|');
  const stops = world.stops.map((s) => `${s.id}@${s.x},${s.y}`).join('|');
  return `${lines}#${stops}`;
}

/** The last few maps worked out, by shape, so a moving train or a new title never works them out again. */
const routes = new Map<string, Map<string, Route>>();
const KEPT = 8;

/** Every track's route as the map draws it, worked out once per shape of the world. */
export function routesOf(world: World): Map<string, Route> {
  const key = shapeKey(world);
  let found = routes.get(key);
  if (!found) {
    const byId = new Map(world.stops.map((s) => [s.id, s]));
    const bends = chooseBends(world);
    found = new Map(
      world.tracks.map((t) => [t.id, routeThrough([t.origin, ...t.stops.map((id) => byId.get(id)!)], bends.get(t.id))]),
    );
    routes.set(key, found);
    if (routes.size > KEPT) routes.delete(routes.keys().next().value!);
  }
  return found;
}

/** The route the map draws for one track, the one a finger finds and a train is drawn on. */
export function routeOf(world: World, track: Track): Route {
  return routesOf(world).get(track.id) ?? routeThrough([track.origin]);
}

/**
 * Where the train is drawn on the route the map chose. The clock runs on lengths, which the bend's
 * place never changes, so the seconds covered on the leg place it; a parked train is at a stop,
 * which every route passes through.
 */
export function trainOn(route: Route, state: TrainState): { at: Point; angle: number } {
  if (state.parked) return { at: state.at, angle: state.angle };
  const { from, to } = legSpan(route, state.leg);
  const length = pathLength(route.vertices, from, to);
  return pointAlong(route.vertices, from, to, length === 0 ? 1 : state.seconds / length);
}

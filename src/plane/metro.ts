import { drawnOnPlane } from '../model/day';
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

/**
 * Where segment pq passes through segment rs, or null. Runs that lie along each other share a
 * road, and a run that ends on another joins it or leaves it; neither is a crossing.
 */
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
  if (t <= slack || t >= 1 - slack || u <= slack || u >= 1 - slack) return null;
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
 * What a leg costs where it is: one for each time it crosses another line,
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
        if (meet(p, q, r, s)) cost += 1;
      }
    }
  }
  for (const stop of stops) {
    if (leg.segments.some(([a, b]) => onSegment(stop, a, b))) cost += 1;
  }
  return cost;
}

/**
 * For every line on the plane, which end of each leg its bend sits at. A leg keeps the diagonal
 * first unless the other end is strictly better. A day line not yet on the plane is left out.
 */
export function chooseBends(world: World, today: string): Map<string, Bend[]> {
  const byId = new Map(world.stops.map((s) => [s.id, s]));
  const tracks = world.tracks.filter((t) => drawnOnPlane(t, today));
  const points = tracks.map((t) => [t.origin, ...t.stops.map((id) => byId.get(id)!)]);
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
  return new Map(tracks.map((t, i) => [t.id, bends[i]]));
}

/** Everything the routes depend on, and nothing else: where each line starts, its stops, and where they are. */
function shapeKey(world: World, today: string): string {
  const lines = world.tracks.filter((t) => drawnOnPlane(t, today)).map((t) => `${t.id}@${t.origin.x},${t.origin.y}:${t.stops.join(',')}`).join('|');
  const stops = world.stops.map((s) => `${s.id}@${s.x},${s.y}`).join('|');
  return `${lines}#${stops}`;
}

/** The last few maps worked out, by shape, so a moving train or a new title never works them out again. */
const routes = new Map<string, Map<string, Route>>();
const KEPT = 8;

/** Every track's route as the map draws it, worked out once per shape of the world. */
export function routesOf(world: World, today: string): Map<string, Route> {
  const key = shapeKey(world, today);
  let found = routes.get(key);
  if (!found) {
    const byId = new Map(world.stops.map((s) => [s.id, s]));
    const bends = chooseBends(world, today);
    found = new Map(
      world.tracks.filter((t) => drawnOnPlane(t, today)).map((t) => [t.id, routeThrough([t.origin, ...t.stops.map((id) => byId.get(id)!)], bends.get(t.id))]),
    );
    routes.set(key, found);
    if (routes.size > KEPT) routes.delete(routes.keys().next().value!);
  }
  return found;
}

/** A track's route, cut wherever another line joins or leaves it, with each piece's lane. */
export interface Lanes {
  route: Route;
  /**
   * shift[k] is how far, in lanes, segment k sits to the side of the road it shares: a unit
   * vector across the road times the lane's place, 0 when the line has the road to itself.
   */
  shift: Point[];
}

type Axis = 'h' | 'v' | 'd' | 'e';

/** Along each of the map's four directions, and the fixed way across it every line on it agrees on. */
const ALONG: Record<Axis, Point> = { h: { x: 1, y: 0 }, v: { x: 0, y: 1 }, d: { x: Math.SQRT1_2, y: Math.SQRT1_2 }, e: { x: Math.SQRT1_2, y: -Math.SQRT1_2 } };
const across = (axis: Axis): Point => ({ x: -ALONG[axis].y, y: ALONG[axis].x });

interface Run {
  /** Which road: the direction and the line it lies on. */
  road: string;
  axis: Axis;
  /** Where along the road it starts and ends, low to high. */
  lo: number;
  hi: number;
}

/** The road a segment lies on, or null when it has no length. */
function roadOf(a: Point, b: Point): Run | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === 0) return null;
  const axis: Axis = dy === 0 ? 'h' : dx === 0 ? 'v' : Math.sign(dx) === Math.sign(dy) ? 'd' : 'e';
  const level = axis === 'h' ? a.y : axis === 'v' ? a.x : axis === 'd' ? a.y - a.x : a.y + a.x;
  const at = (p: Point) => (axis === 'v' ? p.y : p.x);
  return { road: `${axis}${Math.round(level * 1000) / 1000}`, axis, lo: Math.min(at(a), at(b)), hi: Math.max(at(a), at(b)) };
}

const sign = (n: number) => (Math.abs(n) < 1e-9 ? 0 : Math.sign(n));

/**
 * Lines that share a road run side by side, as a ribbon. Each stretch of shared road gives the
 * lines on it a lane apiece, centred on the road. A line takes the side it comes from and leaves
 * to, so lines part without crossing where they can; where that does not decide, the older line
 * is nearer the low side. A line alone on its road keeps to the middle.
 */
export function lanesOf(world: World, today: string): Map<string, Lanes> {
  const key = shapeKey(world, today);
  const kept = laned.get(key);
  if (kept) return kept;
  const found = layLanes(world, today);
  laned.set(key, found);
  if (laned.size > KEPT) laned.delete(laned.keys().next().value!);
  return found;
}

const laned = new Map<string, Map<string, Lanes>>();

function layLanes(world: World, today: string): Map<string, Lanes> {
  const routes = routesOf(world, today);
  const tracks = world.tracks.filter((t) => drawnOnPlane(t, today));
  const lines = tracks.map((t) => routes.get(t.id)!);
  const roads = lines.map((r) => r.vertices.slice(1).map((b, k) => roadOf(r.vertices[k], b)));

  // Which side each line is on, outside a stretch of road it runs: -1, 0 or 1 across the road, summed over both ends.
  const side = (track: number, k: number): number => {
    const run = roads[track][k]!;
    const v = lines[track].vertices;
    let first = k;
    let last = k;
    while (first > 0 && roads[track][first - 1]?.road === run.road) first--;
    while (last < roads[track].length - 1 && roads[track][last + 1]?.road === run.road) last++;
    const n = across(run.axis);
    let score = 0;
    const before = first - 1;
    if (before >= 0) score -= sign((v[first].x - v[before].x) * n.x + (v[first].y - v[before].y) * n.y);
    const after = last + 1;
    if (after < roads[track].length) score += sign((v[after + 1].x - v[after].x) * n.x + (v[after + 1].y - v[after].y) * n.y);
    return score;
  };

  // Every place along each road where some line on it starts or ends.
  const cuts = new Map<string, number[]>();
  roads.forEach((rs) =>
    rs.forEach((r) => {
      if (r) cuts.set(r.road, [...(cuts.get(r.road) ?? []), r.lo, r.hi]);
    }),
  );
  for (const [road, at] of cuts) cuts.set(road, [...new Set(at)].sort((a, b) => a - b));

  // Who is on each stretch of each road, keyed by road and the stretch's start.
  const company = new Map<string, Set<number>>();
  const sides = new Map<string, number>();
  roads.forEach((rs, track) =>
    rs.forEach((r, k) => {
      if (!r) return;
      sides.set(`${track}:${r.road}`, side(track, k));
      for (const at of cuts.get(r.road)!) {
        if (at < r.lo || at >= r.hi) continue;
        const key = `${r.road}@${at}`;
        company.set(key, (company.get(key) ?? new Set()).add(track));
      }
    }),
  );
  const laneOf = (track: number, road: string, at: number): number => {
    const here = [...company.get(`${road}@${at}`)!];
    if (here.length < 2) return 0;
    here.sort((a, b) => sides.get(`${a}:${road}`)! - sides.get(`${b}:${road}`)! || a - b);
    return here.indexOf(track) - (here.length - 1) / 2;
  };

  return new Map(
    tracks.map((t, track) => {
      const { vertices, stationAt } = lines[track];
      const out: Point[] = [vertices[0]];
      const shift: Point[] = [];
      const moved = [0];
      for (let k = 0; k < vertices.length - 1; k++) {
        const a = vertices[k];
        const b = vertices[k + 1];
        const r = roads[track][k];
        if (!r) {
          out.push(b);
          shift.push({ x: 0, y: 0 });
        } else {
          const n = across(r.axis);
          const along = (p: Point) => (r.axis === 'v' ? p.y : p.x);
          const forward = along(b) > along(a);
          const stops = cuts.get(r.road)!.filter((c) => c > r.lo && c < r.hi);
          if (!forward) stops.reverse();
          const starts = [along(a), ...stops];
          const ends = [...stops, along(b)];
          starts.forEach((s0, i) => {
            const s1 = ends[i];
            const f = (s1 - along(a)) / (along(b) - along(a));
            out.push(i === starts.length - 1 ? b : { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f });
            const lane = laneOf(track, r.road, Math.min(s0, s1));
            shift.push(lane === 0 ? { x: 0, y: 0 } : { x: n.x * lane, y: n.y * lane });
          });
        }
        moved.push(out.length - 1);
      }
      return [t.id, { route: { vertices: out, stationAt: stationAt.map((i) => moved[i]) }, shift }];
    }),
  );
}

/** The route the map draws for one track, the one a finger finds and a train is drawn on. */
export function routeOf(world: World, track: Track, today: string): Route {
  const found = routesOf(world, today).get(track.id);
  if (found) return found;
  const byId = new Map(world.stops.map((s) => [s.id, s]));
  return routeThrough([track.origin, ...track.stops.map((id) => byId.get(id)!)]);
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

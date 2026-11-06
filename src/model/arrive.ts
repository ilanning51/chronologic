import { distance, type Point } from '../plane/geometry';
import { pathLength, pointAlong, routeThrough } from '../plane/routing';
import { invertProgress } from './motion';
import { relocate } from './relocate';
import { legSeconds, timeLeft, timeLeftAny, trackRoute, trainState } from './train';
import type { Stop, Track, World } from './types';

/** Arriving within this of the time asked for is arriving then. */
const TOLERANCE_MS = 1000;
/** How finely the road past a stop is walked when looking for a leg length. */
const SAMPLES = 400;

/** When the stop's train pulls in, in ms: now for a stop whose train waits at it. */
export function arrivalOf(world: World, stopId: string, now: number): number {
  return now + timeLeftAny(world, stopId, now) * 1000;
}

/**
 * The project line whose train reaches the stop first, and the stop's index on it: the line that
 * sets the stop's arrival, so the line a slide moves it along. None for a stop on no project, or
 * one every train is past.
 */
export function governingLine(world: World, stopId: string, now: number): { track: Track; index: number } | null {
  const byId = new Map(world.stops.map((s) => [s.id, s]));
  let best: { track: Track; index: number; left: number } | null = null;
  for (const track of world.tracks) {
    const index = track.stops.indexOf(stopId);
    if (track.day || index < 0) continue;
    const state = trainState(track, byId, now);
    if (state.parked || index < state.leg) continue;
    const left = timeLeft(track, stopId, byId, now);
    if (!best || left < best.left) best = { track, index, left };
  }
  return best && { track: best.track, index: best.index };
}

/**
 * The leg into a stop on its governing line, and how its length turns into an arrival. `before` is
 * the time until the train reaches the station the leg starts from; `covered`, when the train is
 * on this very leg, is the seconds of it already run instead.
 */
interface Leg {
  stop: Stop;
  goal: boolean;
  prev: Point;
  /** The road from the leg's start through the stop to the next station, the way a slide walks it. */
  walk: Point[];
  /** How far along the walk the stop is now: the leg's length today. */
  own: number;
  before: number;
  covered: number | null;
}

function legOf(world: World, stopId: string, now: number): Leg | null {
  const stop = world.stops.find((s) => s.id === stopId);
  const line = stop && !stop.done ? governingLine(world, stopId, now) : null;
  if (!stop || !line) return null;
  const { track, index: k } = line;
  const byId = new Map(world.stops.map((s) => [s.id, s]));
  const state = trainState(track, byId, now);
  const route = trackRoute(track, byId);
  const prev = k === 0 ? track.origin : byId.get(track.stops[k - 1])!;
  const goal = k === track.stops.length - 1;
  const next = goal ? null : byId.get(track.stops[k + 1])!;
  const walk = routeThrough(next ? [prev, stop, next] : [prev, stop]).vertices;
  const own = legSeconds(route, k);
  if (state.leg === k) return { stop, goal, prev, walk, own, before: 0, covered: state.seconds };
  let before = (1 - invertProgress(state.fraction)) * legSeconds(route, state.leg);
  for (let i = state.leg + 1; i < k; i++) before += legSeconds(route, i);
  return { stop, goal, prev, walk, own, before, covered: null };
}

/** Seconds from now until the stop's train arrives, were its leg this long. */
function remaining(leg: Leg, length: number): number {
  if (leg.covered === null) return leg.before + length;
  if (length <= 0) return 0;
  return (1 - invertProgress(Math.min(1, leg.covered / length))) * length;
}

/**
 * The leg length that makes the stop arrive `seconds` from now. With the train on the leg, the time
 * left grows with the leg's length from nothing at the train's own point, so halving finds it.
 */
function lengthFor(leg: Leg, seconds: number): number {
  if (leg.covered === null) return Math.max(0, seconds - leg.before);
  let lo = leg.covered;
  if (seconds <= 0) return lo;
  let hi = Math.max(1, 2 * lo, seconds + lo);
  while (remaining(leg, hi) < seconds) hi *= 2;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (remaining(leg, mid) < seconds) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

const total = (walk: Point[]) => pathLength(walk, 0, walk.length - 1);

function along(walk: Point[], d: number): Point {
  const length = total(walk);
  return pointAlong(walk, 0, walk.length - 1, length === 0 ? 0 : d / length).at;
}

/** The leg's length, re-routed from its start to this point. */
function routedFrom(prev: Point, q: Point): number {
  const r = routeThrough([prev, q]).vertices;
  return pathLength(r, 0, r.length - 1);
}

/** Points along the walk past the stop, at their distance along it, the corners included. */
function pastTheStop(leg: Leg): number[] {
  const end = total(leg.walk);
  const ds = new Set<number>();
  for (let i = 0; i <= SAMPLES; i++) ds.add(leg.own + ((end - leg.own) * i) / SAMPLES);
  let d = 0;
  for (let i = 1; i < leg.walk.length; i++) {
    d += distance(leg.walk[i - 1], leg.walk[i]);
    if (d > leg.own) ds.add(d);
  }
  return [...ds].sort((a, b) => a - b);
}

/** The longest the leg can be by walking the stop on toward the next station; a goal's has no end. */
function longest(leg: Leg): number {
  if (leg.goal) return Infinity;
  return Math.max(leg.own, ...pastTheStop(leg).map((d) => routedFrom(leg.prev, along(leg.walk, d))));
}

/**
 * Where the stop goes so its leg is this long. Shorter: back along its own road, where the routed
 * length is the distance walked. Longer: a goal runs on along its last direction; any other stop
 * walks on toward the next station, taking the first point whose re-routed leg is long enough,
 * since past a bend the leg need not keep growing.
 */
function pointFor(leg: Leg, length: number): Point {
  if (length <= leg.own) return along(leg.walk, Math.max(0, length));
  if (leg.goal) {
    const a = leg.walk[leg.walk.length - 2] ?? leg.prev;
    const b = leg.walk[leg.walk.length - 1];
    const span = distance(a, b);
    const extra = length - leg.own;
    if (span === 0) return { x: b.x + extra, y: b.y };
    return { x: b.x + ((b.x - a.x) / span) * extra, y: b.y + ((b.y - a.y) / span) * extra };
  }
  const ds = pastTheStop(leg);
  const len = (d: number) => routedFrom(leg.prev, along(leg.walk, d));
  let best = ds[0];
  for (let i = 1; i < ds.length; i++) {
    if (len(ds[i]) >= length) {
      let lo = ds[i - 1];
      let hi = ds[i];
      for (let j = 0; j < 50; j++) {
        const mid = (lo + hi) / 2;
        if (len(mid) < length) lo = mid;
        else hi = mid;
      }
      return along(leg.walk, hi);
    }
    if (len(ds[i]) > len(best)) best = ds[i];
  }
  return along(leg.walk, best);
}

export interface Reach {
  /** The earliest the stop can arrive, in ms: now, or when the stop before it arrives. */
  earliest: number;
  /** The latest, in ms, or null for a goal, whose last leg can run on without end. */
  latest: number | null;
}

function reachOf(leg: Leg, now: number): Reach {
  const latest = leg.goal ? null : now + remaining(leg, longest(leg)) * 1000;
  return { earliest: now + remaining(leg, leg.covered ?? 0) * 1000, latest };
}

/** The ends the stop can be slid to on its governing line. */
export function reach(world: World, stopId: string, now: number): Reach | null {
  const leg = legOf(world, stopId, now);
  return leg && reachOf(leg, now);
}

export interface Slide {
  /** The world with the stop moved and every train through it kept in place. */
  world: World;
  point: Point;
  /** When the stop now arrives, in ms. */
  end: number;
  /** Whether the end asked for could not be reached, so the slide landed short of it. */
  clamped: boolean;
}

/**
 * Slides a pending stop along its governing line until its train arrives at `end`, or as near as
 * the line allows: only the legs either side of it change. Moving the stop re-routes every line
 * through it, so another line may now reach it first; then the end comes down to the latest one
 * the governing line still delivers.
 */
export function slideTo(world: World, stopId: string, end: number, now: number): Slide | null {
  const leg = legOf(world, stopId, now);
  if (!leg) return null;
  const { earliest, latest } = reachOf(leg, now);
  const target = Math.min(Math.max(end, earliest), latest ?? Infinity);
  const attempt = (t: number) => {
    const point = pointFor(leg, lengthFor(leg, (t - now) / 1000));
    const moved = relocate(world, stopId, point, now);
    return { world: moved, point, arrives: arrivalOf(moved, stopId, now) };
  };
  const first = attempt(target);
  if (Math.abs(first.arrives - target) <= TOLERANCE_MS) {
    return { world: first.world, point: first.point, end: target, clamped: target !== end };
  }
  let lo = earliest;
  let hi = target;
  for (let i = 0; i < 40 && hi - lo > TOLERANCE_MS / 4; i++) {
    const mid = (lo + hi) / 2;
    if (Math.abs(attempt(mid).arrives - mid) <= TOLERANCE_MS) lo = mid;
    else hi = mid;
  }
  const landed = attempt(lo);
  return { world: landed.world, point: landed.point, end: lo, clamped: true };
}

import type { Point } from '../plane/geometry';
import { legSpan, pathLength, pointAlong, routeThrough, type Route } from '../plane/routing';
import { invertProgress, progress } from './motion';
import type { Stop, Track, Train, World } from './types';

/** The track's route: the origin, then every stop in order. */
export function trackRoute(track: Track, byId: Map<string, Stop>): Route {
  const points = [track.origin, ...track.stops.map((id) => byId.get(id)!)];
  return routeThrough(points);
}

/** The planned seconds of a leg: its routed length, since one world unit is one second. */
export function legSeconds(route: Route, leg: number): number {
  const { from, to } = legSpan(route, leg);
  return pathLength(route.vertices, from, to);
}

export interface TrainState {
  leg: number;
  parked: boolean;
  waiting: boolean;
  /** Planned seconds the train has covered on this leg (its offset). */
  seconds: number;
  /** progress(tau), 1 when waiting or parked. */
  fraction: number;
  at: Point;
  angle: number;
}

/**
 * Where the train is at this moment. Waiting is derived: the leg's time has run out, or the
 * leg has no length, and the train sits at the stop it was heading for. A stop done from
 * another line is no reason to wait, so once its leg's time runs out the train is on the next
 * leg, departed when that one ended; the stored train lags and this is the truth.
 */
export function trainState(track: Track, byId: Map<string, Stop>, now: number): TrainState {
  const route = trackRoute(track, byId);
  const { vertices } = route;
  let { leg, departedAt } = track.train;
  while (leg < track.stops.length && byId.get(track.stops[leg])?.done) {
    const ms = legSeconds(route, leg) * 1000;
    if (now - departedAt < ms) break;
    departedAt += ms;
    leg++;
  }
  if (leg >= track.stops.length) return parkedState(track, route, leg);
  const { from, to } = legSpan(route, leg);
  const length = pathLength(vertices, from, to);
  const tau = length === 0 ? 1 : (now - departedAt) / 1000 / length;
  if (tau >= 1) {
    return { leg, parked: false, waiting: true, seconds: length, fraction: 1, ...pointAlong(vertices, from, to, 1) };
  }
  const fraction = progress(tau);
  return { leg, parked: false, waiting: false, seconds: fraction * length, fraction, ...pointAlong(vertices, from, to, fraction) };
}

/** A train past its goal, parked at the last stop (or the origin of a track with none). */
function parkedState(track: Track, route: Route, leg: number): TrainState {
  const { from, to } = legSpan(route, Math.max(0, leg - 1));
  const end = track.stops.length > 0 ? pointAlong(route.vertices, from, to, 1) : { at: route.vertices[0], angle: 0 };
  return { leg, parked: true, waiting: false, seconds: 0, fraction: 1, ...end };
}

/**
 * Seconds until this track's train reaches the stop. Time, not distance: what is left of the
 * current leg's time (nothing while waiting), then each later leg's length up to the stop. A stop
 * done, behind the train, or not on the track at all is no wait. A waiting train adds nothing,
 * so the answer stands still until its stop is tapped.
 */
export function timeLeft(track: Track, stopId: string, byId: Map<string, Stop>, now: number): number {
  const k = track.stops.indexOf(stopId);
  const state = trainState(track, byId, now);
  if (state.parked || k < state.leg || byId.get(stopId)?.done) return 0;
  const route = trackRoute(track, byId);
  let left = (1 - invertProgress(state.fraction)) * legSeconds(route, state.leg);
  for (let i = state.leg + 1; i <= k; i++) left += legSeconds(route, i);
  return left;
}

/**
 * The soonest any project train reaches the stop, 0 when no project lists it. The day line is
 * left out: it has no clock of its own, it only shadows these.
 */
export function timeLeftAny(world: World, stopId: string, now: number): number {
  const byId = new Map(world.stops.map((s) => [s.id, s]));
  let best: number | null = null;
  for (const track of world.tracks) {
    if (track.day || !track.stops.includes(stopId)) continue;
    const left = timeLeft(track, stopId, byId, now);
    if (best === null || left < best) best = left;
  }
  return best ?? 0;
}

/**
 * Where the day train is: the share of its leg's budget the project time has run down, linear
 * in time so it is a literal shadow, never the accelerate-cruise-brake profile. Pulling the
 * project leg longer slides it back, shorter jumps it ahead. It never derives a pass-through over
 * done stops: the reducer keeps the stored day train current.
 */
export function dayState(day: Track, world: World, now: number): TrainState {
  const byId = new Map(world.stops.map((s) => [s.id, s]));
  const route = trackRoute(day, byId);
  const { leg } = day.train;
  if (leg >= day.stops.length) return parkedState(day, route, leg);
  const budget = day.day?.budgets[leg] ?? 0;
  const left = timeLeftAny(world, day.stops[leg], now);
  const fraction = budget === 0 ? 1 : Math.min(1, Math.max(0, 1 - left / budget));
  const { from, to } = legSpan(route, leg);
  const length = pathLength(route.vertices, from, to);
  return {
    leg,
    parked: false,
    waiting: fraction === 1,
    seconds: fraction * length,
    fraction,
    ...pointAlong(route.vertices, from, to, fraction),
  };
}

/** A train on `leg` that has covered `seconds` of a leg `legLength` long, as of now. */
export function rebase(leg: number, seconds: number, legLength: number, now: number): Train {
  if (legLength === 0 || seconds >= legLength) return { leg, departedAt: now - legLength * 1000 };
  return { leg, departedAt: now - invertProgress(seconds / legLength) * legLength * 1000 };
}

/**
 * The index of the first stop at or after the train's leg that is not done, or null once
 * there is none and the train is parked. Done stops are ones the train will pass through.
 */
export function nextIndex(track: Track, byId: Map<string, Stop>): number | null {
  for (let i = track.train.leg; i < track.stops.length; i++) {
    if (!byId.get(track.stops[i])?.done) return i;
  }
  return null;
}

/** The index of the stop the track's edge bubble points at, or null once the train is parked. */
export function targetIndex(track: Track, byId: Map<string, Stop>): number | null {
  const next = nextIndex(track, byId);
  if (next === null) return null;
  const goal = track.stops.length - 1;
  if (track.target === 'next') return next;
  if (track.target === 'goal') return goal;
  for (let i = next; i < goal; i++) {
    if (byId.get(track.stops[i])?.shape === 'triangle') return i;
  }
  return goal;
}

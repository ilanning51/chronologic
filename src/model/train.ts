import type { Point } from '../plane/geometry';
import { legSpan, pathLength, pointAlong, routeThrough, type Route } from '../plane/routing';
import { isProject } from './day';
import { isRing, lifeRoute } from './life';
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
  /** When the train left for this leg (ms epoch), after any pass-through; the crowd counts from it. */
  departedAt: number;
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
  if (leg >= track.stops.length) return parkedState(track, route, leg, departedAt);
  const { from, to } = legSpan(route, leg);
  const length = pathLength(vertices, from, to);
  const tau = length === 0 ? 1 : (now - departedAt) / 1000 / length;
  if (tau >= 1) {
    return { leg, parked: false, waiting: true, seconds: length, fraction: 1, departedAt, ...pointAlong(vertices, from, to, 1) };
  }
  const fraction = progress(tau);
  return { leg, parked: false, waiting: false, seconds: fraction * length, fraction, departedAt, ...pointAlong(vertices, from, to, fraction) };
}

/** A train past its goal, parked at the last stop (or the origin of a track with none). */
function parkedState(track: Track, route: Route, leg: number, departedAt: number): TrainState {
  const { from, to } = legSpan(route, Math.max(0, leg - 1));
  const end = track.stops.length > 0 ? pointAlong(route.vertices, from, to, 1) : { at: route.vertices[0], angle: 0 };
  return { leg, parked: true, waiting: false, seconds: 0, fraction: 1, departedAt, ...end };
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
    if (!isProject(track) || !track.stops.includes(stopId)) continue;
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
  const { leg, departedAt } = day.train;
  if (leg >= day.stops.length) return parkedState(day, route, leg, departedAt);
  // A day not yet begun waits at its start.
  if (day.day?.held) return { leg, parked: false, waiting: true, seconds: 0, fraction: 0, departedAt, at: route.vertices[0], angle: 0 };
  const budget = day.day?.budgets[leg] ?? 0;
  const left = timeLeftAny(world, day.stops[leg], now);
  const fraction = shadowFraction(budget, left);
  const { from, to } = legSpan(route, leg);
  const length = pathLength(route.vertices, from, to);
  return {
    leg,
    parked: false,
    waiting: fraction === 1,
    seconds: fraction * length,
    fraction,
    departedAt,
    ...pointAlong(route.vertices, from, to, fraction),
  };
}

/** The share of a leg's budget the project time has run down, from 0 to 1; a leg with no budget is run. */
function shadowFraction(budget: number, left: number): number {
  return budget === 0 ? 1 : Math.min(1, Math.max(0, 1 - left / budget));
}

/**
 * Where the life train is. On a leg into a ring it is the day train's shadow of the project time.
 * On a leg into a bare marker no project has a clock to shadow, so it rides real time along the leg
 * with the project trains' motion profile and waits at the marker.
 */
export function lifeState(life: Track, world: World, now: number): TrainState {
  const byId = new Map(world.stops.map((s) => [s.id, s]));
  const route = lifeRoute(life, byId);
  const { leg, departedAt } = life.train;
  if (leg >= life.stops.length) return parkedState(life, route, leg, departedAt);
  const { from, to } = legSpan(route, leg);
  const length = pathLength(route.vertices, from, to);
  const stopId = life.stops[leg];
  let fraction: number;
  let waiting: boolean;
  if (isRing(world, stopId)) {
    const budget = life.life?.budgets[leg] ?? 0;
    fraction = shadowFraction(budget, timeLeftAny(world, stopId, now));
    waiting = fraction === 1;
  } else {
    const tau = length === 0 ? 1 : (now - departedAt) / 1000 / length;
    fraction = progress(tau);
    waiting = tau >= 1;
  }
  return { leg, parked: false, waiting, seconds: fraction * length, fraction, departedAt, ...pointAlong(route.vertices, from, to, fraction) };
}

/**
 * Where any track's train is: the day train and the life train are shadows of the projects, every
 * other train keeps its own clock. Every reader that does not care which kind goes through here.
 */
export function stateOf(track: Track, world: World, now: number): TrainState {
  if (track.day) return dayState(track, world, now);
  if (track.life) return lifeState(track, world, now);
  return trainState(track, new Map(world.stops.map((s) => [s.id, s])), now);
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

/**
 * The index of the stop the track's edge bubble points at, or null once the train is parked. The
 * life line points at its next undone square or its last one, never at a sub-goal; `hidden` names
 * squares the level does not draw, which "next" passes over, so the bubble never points at nothing.
 */
export function targetIndex(track: Track, byId: Map<string, Stop>, hidden?: (stopId: string) => boolean): number | null {
  const next = nextIndex(track, byId);
  if (next === null) return null;
  const goal = track.stops.length - 1;
  if (track.life) {
    if (track.target !== 'next') return goal;
    for (let i = next; i < goal; i++) {
      const id = track.stops[i];
      if (!byId.get(id)?.done && !hidden?.(id)) return i;
    }
    return goal;
  }
  if (track.target === 'next') return next;
  if (track.target === 'goal') return goal;
  for (let i = next; i < goal; i++) {
    if (byId.get(track.stops[i])?.shape === 'triangle') return i;
  }
  return goal;
}

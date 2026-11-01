import type { Point } from '../plane/geometry';
import { legSpan, pathLength, pointAlong, routeThrough, type Route } from '../plane/routing';
import { invertProgress, progress } from './motion';
import type { Stop, Track, Train } from './types';

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
 * leg has no length, and the train sits at the stop it was heading for.
 */
export function trainState(track: Track, byId: Map<string, Stop>, now: number): TrainState {
  const route = trackRoute(track, byId);
  const { leg } = track.train;
  const { vertices } = route;
  if (leg >= track.stops.length) {
    const last = Math.max(0, leg - 1);
    const { from, to } = legSpan(route, last);
    const end = track.stops.length > 0 ? pointAlong(vertices, from, to, 1) : { at: vertices[0], angle: 0 };
    return { leg, parked: true, waiting: false, seconds: 0, fraction: 1, ...end };
  }
  const { from, to } = legSpan(route, leg);
  const length = pathLength(vertices, from, to);
  const tau = length === 0 ? 1 : (now - track.train.departedAt) / 1000 / length;
  if (tau >= 1) {
    return { leg, parked: false, waiting: true, seconds: length, fraction: 1, ...pointAlong(vertices, from, to, 1) };
  }
  const fraction = progress(tau);
  return { leg, parked: false, waiting: false, seconds: fraction * length, fraction, ...pointAlong(vertices, from, to, fraction) };
}

/** A train on `leg` that has covered `seconds` of a leg `legLength` long, as of now. */
export function rebase(leg: number, seconds: number, legLength: number, now: number): Train {
  if (legLength === 0 || seconds >= legLength) return { leg, departedAt: now - legLength * 1000 };
  return { leg, departedAt: now - invertProgress(seconds / legLength) * legLength * 1000 };
}

/** The index of the stop the train is heading for, or null once it is parked. */
export function nextIndex(track: Track): number | null {
  return track.train.leg >= track.stops.length ? null : track.train.leg;
}

/** The index of the stop the track's edge bubble points at, or null once the train is parked. */
export function targetIndex(track: Track, byId: Map<string, Stop>): number | null {
  const next = nextIndex(track);
  if (next === null) return null;
  const goal = track.stops.length - 1;
  if (track.target === 'next') return next;
  if (track.target === 'goal') return goal;
  for (let i = next; i < goal; i++) {
    if (byId.get(track.stops[i])?.shape === 'triangle') return i;
  }
  return goal;
}

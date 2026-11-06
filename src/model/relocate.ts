import type { Point } from '../plane/geometry';
import { legSeconds, rebase, trackRoute, trainState } from './train';
import type { Stop, World } from './types';

function stopsById(world: World): Map<string, Stop> {
  return new Map(world.stops.map((s) => [s.id, s]));
}

/**
 * The one rule everything rests on: an edit never moves the train. `after` is the world with the
 * change applied at or ahead of the train, so its leg index still holds; this keeps the seconds the
 * train had covered in `before` (or `keep`, when the caller knows better) and re-derives its
 * departure time against the leg's new length. It reads the derived train, not the stored one:
 * a train that passed through a stop done elsewhere is on a later leg than it says. A parked
 * train has no leg to cover and is left alone.
 */
export function keepTrain(before: World, after: World, trackId: string, now: number, keep?: number): World {
  const was = before.tracks.find((t) => t.id === trackId);
  const track = after.tracks.find((t) => t.id === trackId);
  // The day train shadows the projects and keeps its own leg; a drag never rebases it.
  if (!was || !track || track.day) return after;
  const state = trainState(was, stopsById(before), now);
  if (state.parked) return after;
  const seconds = keep ?? state.seconds;
  const length = legSeconds(trackRoute(track, stopsById(after)), state.leg);
  return { ...after, tracks: after.tracks.map((t) => (t.id === trackId ? { ...track, train: rebase(state.leg, seconds, length, now) } : t)) };
}

/**
 * A stop set down at a new point: every line through it re-routes, and every train keeps its
 * place. `keep`, by track id, holds a train to the seconds it had when a drag began.
 */
export function relocate(world: World, id: string, at: Point, now: number, keep?: Record<string, number>): World {
  const lines = world.tracks.filter((t) => t.stops.includes(id));
  const after: World = { ...world, stops: world.stops.map((s) => (s.id === id ? { ...s, x: at.x, y: at.y } : s)) };
  return lines.reduce((w, t) => keepTrain(world, w, t.id, now, keep?.[t.id]), after);
}

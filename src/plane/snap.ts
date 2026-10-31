import { distance, type Point } from './geometry';
import { nearestOnRoute } from './routing';
import { trackRoute, trainState } from '../model/train';
import type { World } from '../model/types';

/**
 * Where a dragged stop lands on a line. Only the road still ahead counts: from the train's own
 * point on its leg to the goal. Behind the train is history and past the goal is nothing, and a
 * parked track has no road left. Returns the nearest such point within radius (world units), with
 * the leg the new stop would join, or null when no line is near enough.
 */
export function snapToTracks(
  world: World,
  p: Point,
  now: number,
  radius: number,
): { trackId: string; leg: number; at: Point } | null {
  const byId = new Map(world.stops.map((s) => [s.id, s]));
  let best: { trackId: string; leg: number; at: Point; dist: number } | null = null;
  for (const track of world.tracks) {
    const state = trainState(track, byId, now);
    if (state.parked) continue;
    const hit = nearestOnRoute(trackRoute(track, byId), p);
    if (hit.dist > radius || hit.leg < state.leg) continue;
    if (hit.leg === state.leg && hit.offset <= state.seconds) continue;
    if (!best || hit.dist < best.dist) best = { trackId: track.id, leg: hit.leg, at: hit.at, dist: distance(p, hit.at) };
  }
  return best && { trackId: best.trackId, leg: best.leg, at: best.at };
}

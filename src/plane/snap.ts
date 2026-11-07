import { distance, type Point } from './geometry';
import { nearestOnRoute } from './routing';
import { isProject } from '../model/day';
import { dayOf } from '../model/days';
import { lifeOf, lifeTrainX, sortedByX } from '../model/life';
import { legSeconds, trainState } from '../model/train';
import { routeOf } from './metro';
import type { Stop, World } from '../model/types';

export type Snap = { trackId: string; leg: number; offset: number; at: Point };

/**
 * Where a dragged stop lands on a line. Only the road still ahead counts: from the train's own
 * point on its leg to the goal. Behind the train is history and past the goal is nothing, and a
 * parked track has no road left. A point within radius of a stop is no place for another, which
 * would hide under it; that includes the goal and anything just past it. Returns every line with
 * such a point within radius (world units), nearest first, each with the leg the new stop would
 * join and how many seconds along that leg it sits.
 *
 * The day line is never offered: only the sun drag and the day's-end drag fill it. `ignore` is
 * the stop being dragged: a line that already lists it has nothing to offer, and it is never in
 * its own way.
 */
export function snapToAll(world: World, p: Point, now: number, radius: number, ignore?: string): Snap[] {
  const byId = new Map(world.stops.map((s) => [s.id, s]));
  const hits: (Snap & { dist: number })[] = [];
  for (const track of world.tracks) {
    if (!isProject(track) || (ignore !== undefined && track.stops.includes(ignore))) continue;
    const state = trainState(track, byId, now);
    if (state.parked) continue;
    const route = routeOf(world, track, dayOf(now));
    const hit = nearestOnRoute(route, p);
    if (hit.dist > radius || hit.leg < state.leg) continue;
    if (hit.leg === state.leg && hit.offset <= state.seconds) continue;
    if (hit.offset >= legSeconds(route, hit.leg)) continue;
    if (track.stops.some((id) => id !== ignore && distance(byId.get(id)!, hit.at) <= radius)) continue;
    hits.push({ trackId: track.id, leg: hit.leg, offset: hit.offset, at: hit.at, dist: hit.dist });
  }
  hits.sort((a, b) => a.dist - b.dist);
  return hits.map(({ trackId, leg, offset, at }) => ({ trackId, leg, offset, at }));
}

/**
 * Where a square lands on the life line: anywhere right of the life train, past the last square
 * included, at the life line's own height. Offered to squares only, so the caller asks it for
 * them alone; `snapToAll` never offers the life line. Like a project line, it takes no point
 * within radius of a square, except `ignore`, the one being carried. The leg is the one the new
 * square sorts into by x, and the offset how far along it, in seconds.
 */
export function snapToLife(world: World, p: Point, now: number, radius: number, ignore?: string): Snap | null {
  const life = lifeOf(world);
  if (!life || Math.abs(p.y - life.life.y) > radius || p.x <= lifeTrainX(world, life, now)) return null;
  const byId = new Map(world.stops.map((s) => [s.id, s]));
  const others = life.stops.filter((id) => id !== ignore);
  if (others.some((id) => Math.abs(byId.get(id)!.x - p.x) <= radius)) return null;
  const before = sortedByX(others, byId).filter((id) => byId.get(id)!.x < p.x);
  const startX = before.length === 0 ? life.origin.x : byId.get(before[before.length - 1])!.x;
  return { trackId: life.id, leg: before.length, offset: p.x - startX, at: { x: p.x, y: life.life.y } };
}

/** The nearest line a dragged stop would land on, or null when no line is near enough. */
export function snapToTracks(world: World, p: Point, now: number, radius: number, ignore?: string): Snap | null {
  return snapToAll(world, p, now, radius, ignore)[0] ?? null;
}

/** The closest pending stop within radius of p, or null. A done stop is history, not a target. */
export function nearestStop(stops: Stop[], p: Point, radius: number): Stop | null {
  let best: { stop: Stop; dist: number } | null = null;
  for (const stop of stops) {
    if (stop.done) continue;
    const dist = distance(stop, p);
    if (dist <= radius && (!best || dist < best.dist)) best = { stop, dist };
  }
  return best?.stop ?? null;
}

import { routeThrough, type Route } from '../plane/routing';
import { isProject } from './day';
import { legSeconds, lifeState, rebase, timeLeftAny } from './train';
import type { LifePlan, Stop, Track, World } from './types';

/** A track that is the life line. */
export type LifeTrack = Track & { life: LifePlan };

/** The life line, if the world has one. */
export function lifeOf(world: World): LifeTrack | undefined {
  return world.tracks.find((t): t is LifeTrack => t.life !== undefined);
}

/** Whether the life line lists this stop. */
export function onLife(world: World, stopId: string): boolean {
  return lifeOf(world)?.stops.includes(stopId) ?? false;
}

/**
 * A ring: a square the life line and some project both list, that project's goal. A square on the
 * life line and on no project is a bare marker.
 */
export function isRing(world: World, stopId: string): boolean {
  return world.tracks.some((t) => isProject(t) && t.stops.includes(stopId));
}

/** The life line's route: straight, through its origin and every stop, all at the life line's height. */
export function lifeRoute(life: Track, byId: Map<string, Stop>): Route {
  const y = life.life?.y ?? life.origin.y;
  const points = [life.origin, ...life.stops.map((id) => byId.get(id)!)];
  return routeThrough(points.map((p) => ({ x: p.x, y })));
}

/** The ids ordered by their stops' x; stops at the same x keep the order they came in. */
export function sortedByX(ids: string[], byId: Map<string, Pick<Stop, 'x'>>): string[] {
  return [...ids].sort((a, b) => byId.get(a)!.x - byId.get(b)!.x);
}

/** Where the life train is, in x. */
export function lifeTrainX(world: World, life: Track, now: number): number {
  return lifeState(life, world, now).at.x;
}

/** The rightmost done square on the life line, or null when none is done. */
export function lastDoneX(world: World, life: Track): number | null {
  const done = new Map(world.stops.filter((s) => s.done).map((s) => [s.id, s.x]));
  const xs = life.stops.filter((id) => done.has(id)).map((id) => done.get(id)!);
  return xs.length === 0 ? null : Math.max(...xs);
}

/** The life train sets off now toward `leg`, on these budgets. */
function departLife(world: World, life: LifeTrack, leg: number, budgets: number[], now: number): World {
  return replaceLife(world, { ...life, train: { leg, departedAt: now }, life: { ...life.life, budgets } });
}

/**
 * The life train never lags: while the square it heads for is done, it sets off for the next now.
 * A leg into a ring gets the project time left to it at this moment as its budget; a leg into a
 * bare marker needs none, it runs on real time from now. The same world back when nothing moved.
 */
export function settleLife(world: World, now: number): World {
  const life = lifeOf(world);
  if (!life) return world;
  const done = new Set(world.stops.filter((s) => s.done).map((s) => s.id));
  let { leg } = life.train;
  if (leg >= life.stops.length || !done.has(life.stops[leg])) return world;
  const budgets = [...life.life.budgets];
  while (leg < life.stops.length && done.has(life.stops[leg])) {
    leg++;
    if (leg < life.stops.length) budgets[leg] = timeLeftAny(world, life.stops[leg], now);
  }
  return departLife(world, life, leg, budgets, now);
}

/**
 * The life line after its stops changed by adding, joining or re-sorting (its stops are `after`'s,
 * its budgets may no longer line up). Every square keeps the budget of the leg into it, and the
 * train heads for the same square it did, found again by id. A train that was parked and now has
 * a square ahead sets off for it now, so a leg into a marker does not count from the day the
 * train last arrived. The train heads for the first undone square right of where it stood, so a square put or moved
 * between it and its target becomes the target and no undone square is ever behind it.
 */
export function keepLife(before: World, after: World, now: number): World {
  const was = lifeOf(before);
  const track = lifeOf(after);
  if (!was || !track) return after;
  const carried = new Map(was.stops.map((id, i) => [id, was.life.budgets[i] ?? 0]));
  const budgets = track.stops.map((id) => carried.get(id) ?? 0);
  const parked = was.train.leg >= was.stops.length;
  if (parked) {
    const leg = was.stops.length;
    if (track.stops.length <= leg) return replaceLife(after, { ...track, train: { leg, departedAt: was.train.departedAt }, life: { ...track.life, budgets } });
    budgets[leg] = timeLeftAny(after, track.stops[leg], now);
    return departLife(after, track, leg, budgets, now);
  }
  const done = new Set(after.stops.filter((s) => s.done).map((s) => s.id));
  const afterById = new Map(after.stops.map((s) => [s.id, s]));
  const trainX = lifeTrainX(before, was, now);
  const heading = was.stops[was.train.leg];
  // The first undone square right of where the train stood, or the one it was heading for.
  const nearest = track.stops.findIndex((id) => !done.has(id) && (id === heading || afterById.get(id)!.x > trainX));
  if (nearest >= 0 && track.stops[nearest] !== heading) {
    const id = track.stops[nearest];
    if (isRing(after, id)) {
      budgets[nearest] = timeLeftAny(after, id, now);
      return departLife(after, track, nearest, budgets, now);
    }
    // A leg into a marker keeps the place the train stands at.
    const route = lifeRoute(track, afterById);
    const startX = nearest === 0 ? track.origin.x : afterById.get(track.stops[nearest - 1])!.x;
    const kept = rebase(nearest, trainX - startX, legSeconds(route, nearest), now);
    return replaceLife(after, { ...track, train: kept, life: { ...track.life, budgets } });
  }
  const leg = track.stops.indexOf(was.stops[was.train.leg]);
  return replaceLife(after, { ...track, train: { ...was.train, leg }, life: { ...track.life, budgets } });
}

function replaceLife(world: World, life: Track): World {
  return { ...world, tracks: world.tracks.map((t) => (t.id === life.id ? life : t)) };
}

/**
 * The life line after the square at `index` came off it: one budget per stop, the rest aligned by
 * index. The train's leg moves by index alone; if the square was the one it headed for, it heads
 * for the following one, its budget written by `freshLifeBudget` once the rest of the world has
 * settled.
 */
export function lifeWithout(life: Track, index: number): { track: Track; fresh: boolean } {
  const { leg } = life.train;
  const keep = (_: unknown, i: number) => i !== index;
  const track: Track = {
    ...life,
    stops: life.stops.filter(keep),
    train: { ...life.train, leg: index < leg ? leg - 1 : leg },
    life: life.life && { ...life.life, budgets: life.life.budgets.filter(keep) },
  };
  return { track, fresh: index === leg };
}

/** The life train sets off now for the square at its leg, on the project time left to it. */
export function freshLifeBudget(world: World, now: number): World {
  const life = lifeOf(world);
  if (!life) return world;
  const { leg } = life.train;
  if (leg >= life.stops.length) return world;
  const budgets = [...life.life.budgets];
  budgets[leg] = timeLeftAny(world, life.stops[leg], now);
  return departLife(world, life, leg, budgets, now);
}

/**
 * Undo of a square the life train is past: it goes back to head for it, set off now. A ring waits
 * for its project's time, so its budget is the project time left; a bare marker needs none.
 */
export function lifeBackTo(world: World, stopId: string, now: number): World {
  const life = lifeOf(world);
  const index = life ? life.stops.indexOf(stopId) : -1;
  if (!life || index < 0 || index >= life.train.leg) return world;
  const budgets = [...life.life.budgets];
  budgets[index] = timeLeftAny(world, stopId, now);
  return departLife(world, life, index, budgets, now);
}

/**
 * A ring that lost its project is a bare marker, whose leg runs on real time instead of the
 * project's. When the life train was heading for it, it keeps the place it stood.
 */
export function holdLifePlace(before: World, after: World, now: number): World {
  const was = lifeOf(before);
  const track = lifeOf(after);
  if (!was || !track || was.train.leg >= was.stops.length) return after;
  const target = was.stops[was.train.leg];
  const leg = track.stops.indexOf(target);
  if (leg < 0 || !isRing(before, target) || isRing(after, target)) return after;
  const state = lifeState(was, before, now);
  const length = legSeconds(lifeRoute(track, new Map(after.stops.map((s) => [s.id, s]))), leg);
  return replaceLife(after, { ...track, train: rebase(leg, state.seconds, length, now) });
}

import { distance, type Point } from '../plane/geometry';
import { PALETTE } from './palette';
import {
  clearDay,
  dayBackTo,
  dayFor,
  days,
  dayWith,
  dayWithout,
  defaultLength,
  freshDayBudget,
  isDayEnd,
  isProject,
  isShadow,
  offOtherDays,
  settleDay,
  startDay,
  withStopBeforeEnd,
} from './day';
import { dayOf } from './days';
import { moveBlock, place, unplace, type PlaceAction } from './blocks';
import {
  isRing,
  keepLife,
  lastDoneX,
  lifeBackTo,
  lifeOf,
  lifeTrainX,
  lifeWithout,
  onLife,
  settleLife,
  sortedByX,
} from './life';
import { keepTrain } from './relocate';
import { legSeconds, nextIndex, rebase, timeLeftAny, trackRoute, trainState } from './train';
import type { BubbleTarget, Shape, Size, Stop, Track, World } from './types';

/** A new goal starts thirty days out along the x axis: one world unit is one second. */
export const DEFAULT_GOAL_SECONDS = 2_592_000;

/**
 * Where a goal drag started: the train's point, the goal's point and every stop ahead of the
 * train. Each move of the drag scales these originals, so the result never depends on the path.
 */
export interface GoalDragStart {
  train: Point;
  goal: Point;
  ahead: Record<string, Point>;
}

/**
 * keep, where given, is the seconds the train had covered on its leg when a drag began. The drag
 * holds the train to it, so pulling a stop behind the train and back again loses nothing. A drag
 * can re-route several lines through a shared stop, so move and moveGoal keep per track id; a
 * track the record does not name keeps what it has now.
 */
export type Action =
  | { type: 'newTrack'; id: string; goalId: string; title: string; origin: Point; goal?: Point; now: number } // goal: a month out, unless drawn
  | { type: 'addStop'; trackId: string; id: string; shape: Shape; size?: Size; leg: number; x: number; y: number; now: number; keep?: number }
  | { type: 'move'; id: string; x: number; y: number; now: number; keep?: Record<string, number> } // a pending stop that is not the goal
  | { type: 'moveGoal'; trackId: string; x: number; y: number; now: number; keep?: Record<string, number>; from?: GoalDragStart }
  | { type: 'moveOrigin'; trackId: string; x: number; y: number; now: number; keep?: number } // the start of a line
  | { type: 'moveGroup'; stops: Record<string, Point>; origins: Record<string, Point>; now: number; keep?: Record<string, number> } // by stop id and track id, to their new points
  | { type: 'edit'; id: string; title?: string; shape?: 'circle' | 'triangle'; size?: Size; image?: string | null } // image null takes the picture away
  | { type: 'delete'; id: string; now: number } // deleting the goal deletes the track
  | { type: 'join'; trackId: string; stopId: string; leg: number; x: number; y: number; now: number }
  | { type: 'leave'; trackId: string; stopId: string; now: number }
  | { type: 'complete'; trackId: string; now: number }
  | { type: 'undo'; stopId: string; now: number } // by stop, so Not done puts back the one pressed
  | { type: 'cycleTarget'; trackId: string }
  | { type: 'newDay'; id: string; endId: string; origin: Point; stops: string[]; end: Point; now: number; date: string }
  | { type: 'addToDay'; dayId: string; stopId: string; now: number } // appends before the day's-end square
  | { type: 'moveDayEnd'; dayId: string; x: number; y: number; now: number }
  | { type: 'clearDay'; dayId: string; now: number }
  | ({ type: 'place' } & PlaceAction) // a stop onto a date as a block ending at `end`
  | { type: 'moveBlock'; stopId: string; end: number; length: number; now: number }
  | { type: 'unplace'; stopId: string; now: number }
  | { type: 'tick'; now: number }; // clears every day whose date has passed and begins today's

export const EMPTY: World = { tracks: [], stops: [], lastTouched: null };

const NEXT_TARGET: Record<BubbleTarget, BubbleTarget> = { next: 'subgoal', subgoal: 'goal', goal: 'next' };

function stopsById(world: World): Map<string, Stop> {
  return new Map(world.stops.map((s) => [s.id, s]));
}

/** Every track that lists this stop, and the stop's index on each: a stop can sit on several lines. */
export function tracksOf(world: World, stopId: string): { track: Track; index: number }[] {
  const found: { track: Track; index: number }[] = [];
  for (const track of world.tracks) {
    const index = track.stops.indexOf(stopId);
    if (index >= 0) found.push({ track, index });
  }
  return found;
}

function withTrack(world: World, track: Track): Track[] {
  return world.tracks.map((t) => (t.id === track.id ? track : t));
}

/**
 * Takes a stop off every track that lists it and out of the world, or, given `only`, off that one
 * track and nowhere else. On each track the legs either side of it merge, read from the derived
 * train: the dot just behind the train joins its leg to the train's, and the train has covered
 * it, so no train ever goes back. The day line and the life line keep their budgets in step and
 * move their trains by index alone.
 */
function withoutStop(world: World, id: string, now: number, only?: string): World {
  const byId = stopsById(world);
  const kept = new Map<string, { leg: number; seconds: number }>();
  const fresh: string[] = [];
  let freshLife = false;
  const tracks = world.tracks.map((track) => {
    const index = track.stops.indexOf(id);
    if (index < 0 || (only !== undefined && track.id !== only)) return track;
    if (track.day) {
      const off = dayWithout(track, index);
      if (off.fresh) fresh.push(track.id);
      return off.track;
    }
    if (track.life) {
      const off = lifeWithout(track, index);
      if (off.fresh) freshLife = true;
      return off.track;
    }
    const state = trainState(track, byId, now);
    const leg = index < state.leg ? state.leg - 1 : state.leg;
    if (!state.parked) {
      const behind = index === state.leg - 1 ? legSeconds(trackRoute(track, byId), index) : 0;
      kept.set(track.id, { leg, seconds: state.seconds + behind });
    }
    return { ...track, stops: track.stops.filter((s) => s !== id), train: { ...track.train, leg } };
  });
  const after: World = { ...world, tracks, stops: only !== undefined ? world.stops : world.stops.filter((s) => s.id !== id) };
  const afterById = stopsById(after);
  const merged: World = {
    ...after,
    tracks: after.tracks.map((track) => {
      const k = kept.get(track.id);
      if (!k) return track;
      return { ...track, train: rebase(k.leg, k.seconds, legSeconds(trackRoute(track, afterById), k.leg), now) };
    }),
  };
  // Read against the rebased project trains: the day's budget is their time left from now.
  const freshened = fresh.reduce((w, dayId) => freshDayBudget(w, dayId, now), merged);
  return freshLife ? keepLife(world, freshened, now) : freshened;
}

/**
 * Whether Not done can put this stop back: it is done and, on every project line through it, it
 * is ahead of the derived train or the dot just behind it. Two or more behind on any line, it
 * cannot. The day line never blocks: it follows its projects.
 */
export function undoable(world: World, stopId: string, now: number): boolean {
  const byId = stopsById(world);
  if (!byId.get(stopId)?.done) return false;
  const found = tracksOf(world, stopId);
  return found.length > 0 && found.every(({ track, index }) => isShadow(track) || index >= trainState(track, byId, now).leg - 1);
}

/** The actions that can change the day's or the life line's next stop; each ends by settling both. */
const SETTLES = new Set<Action['type']>(['newDay', 'addToDay', 'complete', 'undo', 'leave', 'delete', 'place', 'moveBlock', 'unplace']);

export function reduce(world: World, action: Action): World {
  const next = apply(world, action);
  return next !== world && SETTLES.has(action.type) && 'now' in action ? settleLife(settleDay(next, action.now), action.now) : next;
}

function apply(world: World, action: Action): World {
  switch (action.type) {
    case 'newTrack': {
      const { id, goalId, title, origin, now } = action;
      const at = action.goal ?? { x: origin.x + DEFAULT_GOAL_SECONDS, y: origin.y };
      if (world.tracks.some((t) => t.id === id) || world.stops.some((s) => s.id === goalId)) return world;
      const goal: Stop = {
        id: goalId,
        title,
        shape: 'square',
        size: 'large',
        x: at.x,
        y: at.y,
        done: false,
      };
      const track: Track = {
        id,
        color: world.tracks.filter(isProject).length % PALETTE.length,
        origin: { x: origin.x, y: origin.y },
        stops: [goalId],
        train: { leg: 0, departedAt: now },
        target: 'goal',
      };
      return { tracks: [...world.tracks, track], stops: [...world.stops, goal], lastTouched: id };
    }

    case 'addStop': {
      const { trackId, id, shape, size = 'medium', leg, x, y, now, keep } = action;
      const track = world.tracks.find((t) => t.id === trackId);
      if (!track || world.stops.some((s) => s.id === id)) return world;
      // Nothing is added to the life line alone: a square on it is a project's goal, moved there.
      // A square is no step on any other line either.
      if (track.life || shape === 'square') return world;
      // Against the derived train: a stop slipped in behind where it really is would shift its leg.
      const state = trainState(track, stopsById(world), now);
      if (state.parked || leg < state.leg || leg >= track.stops.length) return world;
      const stop: Stop = { id, title: '', shape, size, x, y, done: false };
      const stops = [...track.stops.slice(0, leg), id, ...track.stops.slice(leg)];
      const after: World = {
        tracks: withTrack(world, { ...track, stops }),
        stops: [...world.stops, stop],
        lastTouched: trackId,
      };
      return keepTrain(world, after, trackId, now, keep);
    }

    case 'move': {
      const { id, x, y, now, keep } = action;
      const found = tracksOf(world, id);
      const stop = world.stops.find((s) => s.id === id);
      if (found.length === 0 || !stop || stop.done) return world;
      const life = lifeOf(world);
      // A square on the life line, ring or marker, slides along it: height pinned, never at or left
      // of the life train or left of the last done square, the life stops sorted by x again.
      if (life?.stops.includes(id)) {
        const doneX = lastDoneX(world, life);
        if (x <= lifeTrainX(world, life, now) || (doneX !== null && x < doneX)) return world;
        const slid: World = { ...world, stops: world.stops.map((s) => (s.id === id ? { ...s, x, y: life.life.y } : s)), lastTouched: life.id };
        const sorted: World = { ...slid, tracks: withTrack(slid, { ...life, stops: sortedByX(life.stops, stopsById(slid)) }) };
        const rerouted = found
          .filter(({ track }) => !track.life)
          .reduce((w, { track }) => keepTrain(world, w, track.id, now, keep?.[track.id]), sorted);
        return keepLife(world, rerouted, now);
      }
      // A goal moves by moveGoal, which scales its line with it.
      if (found.some(({ track, index }) => index === track.stops.length - 1)) return world;
      // One point: every line through it re-routes, and every train keeps its place.
      const after: World = {
        ...world,
        stops: world.stops.map((s) => (s.id === id ? { ...s, x, y } : s)),
        lastTouched: found[0].track.id,
      };
      return found.reduce((w, { track }) => keepTrain(world, w, track.id, now, keep?.[track.id]), after);
    }

    case 'moveGoal': {
      const { trackId, x, y, now, keep, from } = action;
      const track = world.tracks.find((t) => t.id === trackId);
      if (!track || track.train.leg >= track.stops.length) return world;
      const goalId = track.stops[track.stops.length - 1];
      const goal = world.stops.find((s) => s.id === goalId);
      // A goal on the life line moves along it by move, never by scaling its line.
      if (!goal || goal.done || onLife(world, goalId)) return world;
      // With a snapshot every move scales the drag's starting points; without one, today's.
      const byId = stopsById(world);
      const train = trainState(track, byId, now);
      const T = from?.train ?? train.at;
      const before = distance(T, from?.goal ?? goal);
      const k = before === 0 ? 1 : distance(T, { x, y }) / before;
      // Pending stops ahead of the derived train: one passed through or done elsewhere stays put.
      const ahead = new Set(track.stops.slice(train.leg, -1).filter((id) => !byId.get(id)?.done));
      const after: World = {
        ...world,
        stops: world.stops.map((s) => {
          if (s.id === goalId) return { ...s, x, y };
          if (!ahead.has(s.id)) return s;
          const o = from?.ahead[s.id] ?? s;
          return { ...s, x: T.x + k * (o.x - T.x), y: T.y + k * (o.y - T.y) };
        }),
        lastTouched: trackId,
      };
      // A shared stop is one point, so every line through anything that moved re-routes.
      const moved = new Set([goalId, ...ahead]);
      const touched = world.tracks.filter((t) => t.stops.some((id) => moved.has(id)));
      return touched.reduce((w, t) => keepTrain(world, w, t.id, now, keep?.[t.id]), after);
    }

    case 'moveOrigin': {
      const { trackId, x, y, now, keep } = action;
      const track = world.tracks.find((t) => t.id === trackId);
      if (!track) return world;
      // The first leg may change length under its train; any later leg is history and keeps its time.
      const after: World = { ...world, tracks: withTrack(world, { ...track, origin: { x, y } }), lastTouched: trackId };
      return keepTrain(world, after, trackId, now, keep);
    }

    case 'moveGroup': {
      const { now, keep } = action;
      // Only what the world knows; a stop moves done or not, as the whole picture slides together.
      // A square on the life line keeps the life line's height whatever the group gives it.
      const lifeLine = lifeOf(world);
      const stops = Object.entries(action.stops)
        .filter(([id]) => world.stops.some((s) => s.id === id))
        .map(([id, p]): [string, Point] => [id, lifeLine?.life && lifeLine.stops.includes(id) ? { x: p.x, y: lifeLine.life.y } : p]);
      const origins = Object.entries(action.origins).filter(([id]) => world.tracks.some((t) => t.id === id));
      if (stops.length === 0 && origins.length === 0) return world;
      const stopAt = new Map(stops);
      const originAt = new Map(origins);
      // Every line whose start moved or that lists a moved stop re-routes, and each train keeps its place.
      const touched = world.tracks.filter((t) => originAt.has(t.id) || t.stops.some((id) => stopAt.has(id)));
      const after: World = {
        tracks: world.tracks.map((t) => (originAt.has(t.id) ? { ...t, origin: { ...originAt.get(t.id)! } } : t)),
        stops: world.stops.map((s) => (stopAt.has(s.id) ? { ...s, ...stopAt.get(s.id)! } : s)),
        lastTouched: touched[0]?.id ?? world.lastTouched,
      };
      // A pending life square never ends at or left of the life train, nor left of the last done
      // square: a group that would put one there stays where it was.
      if (lifeLine?.life) {
        const trainAt = lifeTrainX(world, lifeLine, now);
        const doneAt = lastDoneX(after, lifeLine);
        const pending = new Set(world.stops.filter((s) => !s.done).map((s) => s.id));
        const blocked = lifeLine.stops.some((id) => {
          const to = stopAt.get(id);
          return to !== undefined && pending.has(id) && (to.x <= trainAt || (doneAt !== null && to.x < doneAt));
        });
        if (blocked) return world;
      }
      const rerouted = touched.reduce((w, t) => keepTrain(world, w, t.id, now, keep?.[t.id]), after);
      // Squares carried along the life line keep their order by x, and the life train its rule.
      const life = lifeOf(rerouted);
      if (!life || !life.stops.some((id) => stopAt.has(id))) return rerouted;
      const sorted: World = { ...rerouted, tracks: withTrack(rerouted, { ...life, stops: sortedByX(life.stops, stopsById(rerouted)) }) };
      return keepLife(world, sorted, now);
    }

    case 'edit': {
      const { id, title, shape, size, image } = action;
      const found = tracksOf(world, id);
      const stop = world.stops.find((s) => s.id === id);
      if (found.length === 0 || !stop) return world;
      // Nothing that would change, such as an empty name committed on a bare stop, is no step.
      const same =
        (title === undefined || title === stop.title) &&
        (shape === undefined || shape === stop.shape || stop.shape === 'square') &&
        (size === undefined || size === stop.size) &&
        (image === undefined || stop.shape !== 'square' || image === (stop.image ?? null));
      if (same) return world;
      return {
        ...world,
        stops: world.stops.map((s) => {
          if (s.id !== id) return s;
          // Only a square holds a picture; null takes it away, key and all.
          const { image: had, ...rest } = s;
          const picture = image === undefined || s.shape !== 'square' ? had : image === null ? undefined : image;
          return {
            ...rest,
            ...(picture !== undefined ? { image: picture } : {}),
            ...(title !== undefined ? { title } : {}),
            ...(shape !== undefined && s.shape !== 'square' ? { shape } : {}),
            ...(size !== undefined ? { size } : {}),
          };
        }),
        lastTouched: found[0].track.id,
      };
    }

    case 'delete': {
      const { id, now } = action;
      const found = tracksOf(world, id);
      if (found.length === 0) return world;
      if (isDayEnd(world, id)) return clearDay(world, dayWith(world, id)!.id);
      // A goal's home is a project: a stop last on the day line is only the day's last errand.
      const home = found.find(({ track, index }) => isProject(track) && index === track.stops.length - 1)?.track;
      if (home) {
        const others = world.tracks.filter((t) => t.id !== home.id);
        // Only projects keep a stop alive: the goal goes, and every stop no other project lists,
        // the life line's square with them, since nothing stands on the life line alone.
        const orphans = home.stops.filter((s) => s === id || !others.some((t) => isProject(t) && t.stops.includes(s)));
        // Off the life line first, while the project is still there, so the life train is placed
        // from where it stood on that project's time.
        const life = lifeOf(world);
        const offLife = orphans.filter((s) => life?.stops.includes(s)).reduce((w, s) => withoutStop(w, s, now, life!.id), world);
        const rest: World = {
          ...offLife,
          tracks: offLife.tracks.filter((t) => t.id !== home.id),
          lastTouched: offLife.lastTouched === home.id ? null : offLife.lastTouched,
        };
        return orphans.reduce((w, s) => withoutStop(w, s, now), rest);
      }
      const byId = stopsById(world);
      // A parked day train blocks nothing: it shadows the projects, it does not hold their stops.
      if (found.some(({ track }) => isProject(track) && trainState(track, byId, now).parked)) return world;
      return withoutStop(world, id, now);
    }

    case 'join': {
      const { trackId, stopId, leg, x, y, now } = action;
      const track = world.tracks.find((t) => t.id === trackId);
      const stop = world.stops.find((s) => s.id === stopId);
      if (!track || !stop || stop.done || track.stops.includes(stopId)) return world;
      // The life line takes squares only, right of its train, sorted in by x at its own height.
      if (track.life) {
        if (stop.shape !== 'square' || x <= lifeTrainX(world, track, now)) return world;
        const placedStop: World = { ...world, stops: world.stops.map((s) => (s.id === stopId ? { ...s, x, y: track.life!.y } : s)) };
        const placed = sortedByX([...track.stops, stopId], stopsById(placedStop));
        const joined: World = { ...placedStop, tracks: withTrack(world, { ...track, stops: placed }), lastTouched: trackId };
        // The goal's project bends its last leg to follow; its train keeps its place.
        const rerouted = tracksOf(joined, stopId)
          .filter((t) => !t.track.life)
          .reduce((w, { track: t }) => keepTrain(world, w, t.id, now), joined);
        return keepLife(world, rerouted, now);
      }
      // Otherwise only projects take a join: the day is filled by the sun drag and the day's-end drag.
      if (isShadow(track)) return world;
      // Ahead of the derived train and before the goal, so a square never lands last.
      const state = trainState(track, stopsById(world), now);
      if (leg < state.leg || leg > track.stops.length - 1) return world;
      const stops = [...track.stops.slice(0, leg), stopId, ...track.stops.slice(leg)];
      const after: World = {
        tracks: withTrack(world, { ...track, stops }),
        stops: world.stops.map((s) => (s.id === stopId ? { ...s, x, y } : s)),
        lastTouched: trackId,
      };
      // The joined line gained a stop; every other line through it re-routes to where it moved.
      return tracksOf(after, stopId).reduce((w, { track: t }) => keepTrain(world, w, t.id, now), after);
    }

    case 'leave': {
      const { trackId, stopId, now } = action;
      const track = world.tracks.find((t) => t.id === trackId);
      const index = track ? track.stops.indexOf(stopId) : -1;
      // A project's last stop is its goal, a square's home: that one stays. The life line has no goal.
      if (!track || index < 0 || (!track.life && index === track.stops.length - 1)) return world;
      // Only projects keep a stop alive, so leaving its last project is delete, day and all.
      const kept = world.tracks.some((t) => t.id !== trackId && isProject(t) && t.stops.includes(stopId));
      if (!kept) return reduce(world, { type: 'delete', id: stopId, now });
      return { ...withoutStop(world, stopId, now, trackId), lastTouched: trackId };
    }

    case 'complete': {
      const { trackId, now } = action;
      const track = world.tracks.find((t) => t.id === trackId);
      const byId = stopsById(world);
      const next = track && nextIndex(track, byId);
      if (!track || next == null) return world;
      const doneId = track.stops[next];
      // A ring's button speaks for its project; only a bare marker completes through the life line.
      if (track.life && isRing(world, doneId)) return world;
      // A line whose next stop this is departs too; where it lies further ahead, the train
      // passes through it later. The day train is left to settleDay, which writes its budget.
      const tracks = world.tracks.map((t) => {
        if (isShadow(t)) return t;
        if (t.id === trackId) return { ...t, train: { leg: next + 1, departedAt: now } };
        const i = t.stops.indexOf(doneId);
        return i >= 0 && nextIndex(t, byId) === i ? { ...t, train: { leg: i + 1, departedAt: now } } : t;
      });
      return {
        tracks,
        stops: world.stops.map((s) => (s.id === doneId ? { ...s, done: true, doneAt: now } : s)),
        lastTouched: trackId,
      };
    }

    case 'undo': {
      const { stopId: id, now } = action;
      if (!undoable(world, id, now)) return world;
      const byId = stopsById(world);
      // Not done any more, so no time it was done either.
      const stops = world.stops.map((s) => {
        if (s.id !== id) return s;
        const { doneAt: _, ...rest } = s;
        return { ...rest, done: false };
      });
      const after = stopsById({ ...world, stops });
      // Each project train past the stop goes back to wait at it; one still short of it is left
      // alone. Legs are the derived trains': a train that rolled through it has it just behind.
      const undone: World = {
        tracks: world.tracks.map((t) => {
          const i = t.stops.indexOf(id);
          if (isShadow(t) || i < 0 || i !== trainState(t, byId, now).leg - 1) return t;
          const length = legSeconds(trackRoute(t, after), i);
          return { ...t, train: rebase(i, length, length, now) };
        }),
        stops,
        lastTouched: (tracksOf(world, id).find(({ track }) => isProject(track)) ?? tracksOf(world, id)[0]).track.id,
      };
      // The day train waits there too, on budget 0, however far past it it was; the life train
      // heads for it again.
      return lifeBackTo(dayBackTo(undone, id, now), id, now);
    }

    case 'cycleTarget': {
      const track = world.tracks.find((t) => t.id === action.trackId);
      if (!track) return world;
      return {
        ...world,
        // The life line has no sub-goals: it points at its next square or its last.
        tracks: withTrack(world, { ...track, target: track.life ? (track.target === 'next' ? 'goal' : 'next') : NEXT_TARGET[track.target] }),
        lastTouched: track.id,
      };
    }

    case 'newDay': {
      const { id, endId, origin, end, now, date } = action;
      // The day drawn for a date replaces that date's day and no other.
      const old = dayFor(world, date);
      const cleared = old ? clearDay(world, old.id) : world;
      if (cleared.tracks.some((t) => t.id === id) || cleared.stops.some((s) => s.id === endId)) return world;
      const byId = stopsById(cleared);
      // Pending stops some project lists, each once, in the order drawn, and none the life line
      // lists: a ring is a goal on the life line, not an errand. The old end square is gone.
      const picked = [...new Set(action.stops)].filter(
        (s) => byId.get(s)?.done === false && !onLife(cleared, s) && cleared.tracks.some((t) => isProject(t) && t.stops.includes(s)),
      );
      if (picked.length === 0) return world;
      // A stop sits on one day at most: drawn onto this one, it comes off any other.
      const rest = offOtherDays(cleared, picked, now);
      const square: Stop = { id: endId, title: '', shape: 'square', size: 'small', x: end.x, y: end.y, done: false };
      // Only the first leg's budget is known now; each later one is written as the train sets off.
      const budgets = [timeLeftAny(rest, picked[0], now), ...picked.map(() => 0)];
      const lengths = [...picked.map((s) => defaultLength(byId.get(s))), defaultLength(square)];
      const day: Track = {
        id,
        color: 0,
        origin: { x: origin.x, y: origin.y },
        stops: [...picked, endId],
        train: { leg: 0, departedAt: now },
        target: 'goal',
        day: { date, budgets, lengths },
      };
      return { tracks: [...rest.tracks, day], stops: [...rest.stops, square], lastTouched: id };
    }

    case 'addToDay': {
      const { dayId, stopId, now } = action;
      const day = world.tracks.find((t) => t.id === dayId);
      const stop = world.stops.find((s) => s.id === stopId);
      if (!day?.day || !stop || stop.done || day.stops.includes(stopId)) return world;
      if (onLife(world, stopId) || !world.tracks.some((t) => isProject(t) && t.stops.includes(stopId))) return world;
      // A finished day has parked past its end square: nothing goes behind it.
      if (day.train.leg > day.stops.length - 1) return world;
      // A stop sits on one day at most: added to this one, it comes off any other.
      const rest = offOtherDays(world, [stopId], now, dayId);
      const here = rest.tracks.find((t) => t.id === dayId)!;
      const added = withStopBeforeEnd(here, stopId, defaultLength(stop));
      const after: World = { ...rest, tracks: withTrack(rest, added), lastTouched: dayId };
      // Waiting at the end square, the day train now heads for this stop instead.
      return here.train.leg === here.stops.length - 1 ? freshDayBudget(after, dayId, now) : after;
    }

    case 'moveDayEnd': {
      const { dayId, x, y } = action;
      const day = world.tracks.find((t) => t.id === dayId && t.day);
      const end = day?.stops[day.stops.length - 1];
      if (!day || end === undefined || !isDayEnd(world, end)) return world;
      return { ...world, stops: world.stops.map((s) => (s.id === end ? { ...s, x, y } : s)), lastTouched: day.id };
    }

    case 'clearDay':
      return clearDay(world, action.dayId);

    case 'place':
      return place(world, action);

    case 'moveBlock':
      return moveBlock(world, action);

    case 'unplace':
      return unplace(world, action);

    case 'tick': {
      // Days before today go, unfinished stops and all; today's day, if it was waiting, begins.
      // The store skips notifying on the same world, so a tick that changes nothing returns it.
      const today = dayOf(action.now);
      const past = days(world).filter((t) => t.day!.date < today);
      const cleared = past.reduce((w, t) => clearDay(w, t.id), world);
      const begun = dayFor(cleared, today);
      return begun?.day?.held ? startDay(cleared, begun.id, action.now) : cleared;
    }
  }
}

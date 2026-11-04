import { distance, type Point } from '../plane/geometry';
import { PALETTE } from './palette';
import { clearDay, dayBackTo, dayTrack, dayWithout, freshDayBudget, isDayEnd, settleDay } from './day';
import { dayOf } from './days';
import { legSeconds, nextIndex, rebase, timeLeftAny, trackRoute, trainState } from './train';
import type { BubbleTarget, Size, Stop, Track, World } from './types';

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
  | { type: 'addStop'; trackId: string; id: string; shape: 'circle' | 'triangle'; leg: number; x: number; y: number; now: number; keep?: number }
  | { type: 'move'; id: string; x: number; y: number; now: number; keep?: Record<string, number> } // a pending stop that is not the goal
  | { type: 'moveGoal'; trackId: string; x: number; y: number; now: number; keep?: Record<string, number>; from?: GoalDragStart }
  | { type: 'moveOrigin'; trackId: string; x: number; y: number; now: number; keep?: number } // the start of a line
  | { type: 'moveGroup'; stops: Record<string, Point>; origins: Record<string, Point>; now: number; keep?: Record<string, number> } // by stop id and track id, to their new points
  | { type: 'edit'; id: string; title?: string; shape?: 'circle' | 'triangle'; size?: Size }
  | { type: 'delete'; id: string; now: number } // deleting the goal deletes the track
  | { type: 'join'; trackId: string; stopId: string; leg: number; x: number; y: number; now: number }
  | { type: 'leave'; trackId: string; stopId: string; now: number }
  | { type: 'complete'; trackId: string; now: number }
  | { type: 'undo'; stopId: string; now: number } // by stop, so Not done puts back the one pressed
  | { type: 'cycleTarget'; trackId: string }
  | { type: 'newDay'; id: string; endId: string; origin: Point; stops: string[]; end: Point; now: number; date: string }
  | { type: 'addToDay'; stopId: string; now: number } // appends before the day's-end square
  | { type: 'moveDayEnd'; x: number; y: number; now: number }
  | { type: 'clearDay'; now: number }
  | { type: 'tick'; now: number }; // clears a day whose date has passed

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
 * The one rule everything rests on: an edit never moves the train. `after` is the world with the
 * change applied at or ahead of the train, so its leg index still holds; this keeps the seconds the
 * train had covered in `before` (or `keep`, when the caller knows better) and re-derives its
 * departure time against the leg's new length. It reads the derived train, not the stored one:
 * a train that passed through a stop done elsewhere is on a later leg than it says. A parked
 * train has no leg to cover and is left alone.
 */
function keepTrain(before: World, after: World, trackId: string, now: number, keep?: number): World {
  const was = before.tracks.find((t) => t.id === trackId);
  const track = after.tracks.find((t) => t.id === trackId);
  // The day train shadows the projects and keeps its own leg; a drag never rebases it.
  if (!was || !track || track.day) return after;
  const state = trainState(was, stopsById(before), now);
  if (state.parked) return after;
  const seconds = keep ?? state.seconds;
  const length = legSeconds(trackRoute(track, stopsById(after)), state.leg);
  return { ...after, tracks: withTrack(after, { ...track, train: rebase(state.leg, seconds, length, now) }) };
}

/**
 * Takes a stop off every track that lists it and out of the world, or, given `only`, off that one
 * track and nowhere else. On each track the legs either side of it merge, read from the derived
 * train: the dot just behind the train joins its leg to the train's, and the train has covered
 * it, so no train ever goes back. The day line keeps its budgets in step and moves its train by
 * index alone.
 */
function withoutStop(world: World, id: string, now: number, only?: string): World {
  const byId = stopsById(world);
  const kept = new Map<string, { leg: number; seconds: number }>();
  let fresh = false;
  const tracks = world.tracks.map((track) => {
    const index = track.stops.indexOf(id);
    if (index < 0 || (only !== undefined && track.id !== only)) return track;
    if (track.day) {
      const off = dayWithout(track, index);
      fresh = off.fresh;
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
  return fresh ? freshDayBudget(merged, now) : merged;
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
  return found.length > 0 && found.every(({ track, index }) => track.day || index >= trainState(track, byId, now).leg - 1);
}

/** The actions that can change the day's next stop; each ends by settling the day. */
const SETTLES = new Set<Action['type']>(['newDay', 'addToDay', 'complete', 'undo', 'leave', 'delete']);

export function reduce(world: World, action: Action): World {
  const next = apply(world, action);
  return next !== world && SETTLES.has(action.type) && 'now' in action ? settleDay(next, action.now) : next;
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
        color: world.tracks.length % PALETTE.length,
        origin: { x: origin.x, y: origin.y },
        stops: [goalId],
        train: { leg: 0, departedAt: now },
        target: 'goal',
      };
      return { tracks: [...world.tracks, track], stops: [...world.stops, goal], lastTouched: id };
    }

    case 'addStop': {
      const { trackId, id, shape, leg, x, y, now, keep } = action;
      const track = world.tracks.find((t) => t.id === trackId);
      if (!track || world.stops.some((s) => s.id === id)) return world;
      // Against the derived train: a stop slipped in behind where it really is would shift its leg.
      const state = trainState(track, stopsById(world), now);
      if (state.parked || leg < state.leg || leg >= track.stops.length) return world;
      const stop: Stop = { id, title: '', shape, size: 'medium', x, y, done: false };
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
      if (!goal || goal.done) return world;
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
      const stops = Object.entries(action.stops).filter(([id]) => world.stops.some((s) => s.id === id));
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
      return touched.reduce((w, t) => keepTrain(world, w, t.id, now, keep?.[t.id]), after);
    }

    case 'edit': {
      const { id, title, shape, size } = action;
      const found = tracksOf(world, id);
      if (found.length === 0) return world;
      return {
        ...world,
        stops: world.stops.map((s) => {
          if (s.id !== id) return s;
          return {
            ...s,
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
      if (isDayEnd(world, id)) return clearDay(world);
      // A goal's home is a project: a stop last on the day line is only the day's last errand.
      const home = found.find(({ track, index }) => !track.day && index === track.stops.length - 1)?.track;
      if (home) {
        const rest: World = {
          ...world,
          tracks: world.tracks.filter((t) => t.id !== home.id),
          lastTouched: world.lastTouched === home.id ? null : world.lastTouched,
        };
        // Only projects keep a stop alive: the goal goes, and every stop no other project lists.
        const gone = home.stops.filter((s) => s === id || !rest.tracks.some((t) => !t.day && t.stops.includes(s)));
        return gone.reduce((w, s) => withoutStop(w, s, now), rest);
      }
      const byId = stopsById(world);
      // A parked day train blocks nothing: it shadows the projects, it does not hold their stops.
      if (found.some(({ track }) => !track.day && trainState(track, byId, now).parked)) return world;
      return withoutStop(world, id, now);
    }

    case 'join': {
      const { trackId, stopId, leg, x, y, now } = action;
      const track = world.tracks.find((t) => t.id === trackId);
      const stop = world.stops.find((s) => s.id === stopId);
      // Only projects take a join: the day is filled by the sun drag and the day's-end drag.
      if (!track || track.day || !stop || stop.done || track.stops.includes(stopId)) return world;
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
      // A track's last stop is its goal, a square's home: that one stays.
      if (!track || index < 0 || index === track.stops.length - 1) return world;
      // Only projects keep a stop alive, so leaving its last project is delete, day and all.
      const kept = world.tracks.some((t) => t.id !== trackId && !t.day && t.stops.includes(stopId));
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
      // A line whose next stop this is departs too; where it lies further ahead, the train
      // passes through it later. The day train is left to settleDay, which writes its budget.
      const tracks = world.tracks.map((t) => {
        if (t.day) return t;
        if (t.id === trackId) return { ...t, train: { leg: next + 1, departedAt: now } };
        const i = t.stops.indexOf(doneId);
        return i >= 0 && nextIndex(t, byId) === i ? { ...t, train: { leg: i + 1, departedAt: now } } : t;
      });
      return {
        tracks,
        stops: world.stops.map((s) => (s.id === doneId ? { ...s, done: true } : s)),
        lastTouched: trackId,
      };
    }

    case 'undo': {
      const { stopId: id, now } = action;
      if (!undoable(world, id, now)) return world;
      const byId = stopsById(world);
      const stops = world.stops.map((s) => (s.id === id ? { ...s, done: false } : s));
      const after = stopsById({ ...world, stops });
      // Each project train past the stop goes back to wait at it; one still short of it is left
      // alone. Legs are the derived trains': a train that rolled through it has it just behind.
      const undone: World = {
        tracks: world.tracks.map((t) => {
          const i = t.stops.indexOf(id);
          if (t.day || i < 0 || i !== trainState(t, byId, now).leg - 1) return t;
          const length = legSeconds(trackRoute(t, after), i);
          return { ...t, train: rebase(i, length, length, now) };
        }),
        stops,
        lastTouched: (tracksOf(world, id).find(({ track }) => !track.day) ?? tracksOf(world, id)[0]).track.id,
      };
      // The day train waits there too, on budget 0, however far past it it was.
      return dayBackTo(undone, id, now);
    }

    case 'cycleTarget': {
      const track = world.tracks.find((t) => t.id === action.trackId);
      if (!track) return world;
      return {
        ...world,
        tracks: withTrack(world, { ...track, target: NEXT_TARGET[track.target] }),
        lastTouched: track.id,
      };
    }

    case 'newDay': {
      const { id, endId, origin, end, now, date } = action;
      const rest = clearDay(world);
      if (rest.tracks.some((t) => t.id === id) || rest.stops.some((s) => s.id === endId)) return world;
      const byId = stopsById(rest);
      // Pending stops some project lists, each once, in the order drawn. The old end square is gone.
      const picked = [...new Set(action.stops)].filter(
        (s) => byId.get(s)?.done === false && rest.tracks.some((t) => t.stops.includes(s)),
      );
      if (picked.length === 0) return world;
      const square: Stop = { id: endId, title: '', shape: 'square', size: 'small', x: end.x, y: end.y, done: false };
      // Only the first leg's budget is known now; each later one is written as the train sets off.
      const budgets = [timeLeftAny(rest, picked[0], now), ...picked.map(() => 0)];
      const day: Track = {
        id,
        color: 0,
        origin: { x: origin.x, y: origin.y },
        stops: [...picked, endId],
        train: { leg: 0, departedAt: now },
        target: 'goal',
        day: { date, budgets },
      };
      return { tracks: [...rest.tracks, day], stops: [...rest.stops, square], lastTouched: id };
    }

    case 'addToDay': {
      const { stopId, now } = action;
      const day = dayTrack(world);
      const stop = world.stops.find((s) => s.id === stopId);
      if (!day?.day || !stop || stop.done || day.stops.includes(stopId)) return world;
      if (!world.tracks.some((t) => !t.day && t.stops.includes(stopId))) return world;
      // A finished day has parked past its end square: nothing goes behind it.
      const last = day.stops.length - 1;
      if (day.train.leg > last) return world;
      const stops = [...day.stops.slice(0, last), stopId, day.stops[last]];
      const budgets = [...day.day.budgets.slice(0, last), 0, ...day.day.budgets.slice(last)];
      const after: World = { ...world, tracks: withTrack(world, { ...day, stops, day: { ...day.day, budgets } }), lastTouched: day.id };
      // Waiting at the end square, the day train now heads for this stop instead.
      return day.train.leg === last ? freshDayBudget(after, now) : after;
    }

    case 'moveDayEnd': {
      const { x, y } = action;
      const day = dayTrack(world);
      const end = day?.stops[day.stops.length - 1];
      if (!day || end === undefined || !isDayEnd(world, end)) return world;
      return { ...world, stops: world.stops.map((s) => (s.id === end ? { ...s, x, y } : s)), lastTouched: day.id };
    }

    case 'clearDay':
      return clearDay(world);

    case 'tick': {
      const day = dayTrack(world);
      // The store skips notifying on the same world, so a tick that changes nothing returns it.
      return day?.day && day.day.date !== dayOf(action.now) ? clearDay(world) : world;
    }
  }
}

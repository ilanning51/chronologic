import { distance, type Point } from '../plane/geometry';
import { PALETTE } from './palette';
import { legSeconds, nextIndex, rebase, trackRoute, trainState } from './train';
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
  | { type: 'newTrack'; id: string; goalId: string; title: string; origin: Point; now: number }
  | { type: 'addStop'; trackId: string; id: string; shape: 'circle' | 'triangle'; leg: number; x: number; y: number; now: number; keep?: number }
  | { type: 'move'; id: string; x: number; y: number; now: number; keep?: Record<string, number> } // a pending stop that is not the goal
  | { type: 'moveGoal'; trackId: string; x: number; y: number; now: number; keep?: Record<string, number>; from?: GoalDragStart }
  | { type: 'edit'; id: string; title?: string; shape?: 'circle' | 'triangle'; size?: Size }
  | { type: 'delete'; id: string; now: number } // deleting the goal deletes the track
  | { type: 'complete'; trackId: string; now: number }
  | { type: 'undo'; trackId: string; now: number }
  | { type: 'cycleTarget'; trackId: string };

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
  if (!was || !track) return after;
  const state = trainState(was, stopsById(before), now);
  if (state.parked) return after;
  const seconds = keep ?? state.seconds;
  const length = legSeconds(trackRoute(track, stopsById(after)), state.leg);
  return { ...after, tracks: withTrack(after, { ...track, train: rebase(state.leg, seconds, length, now) }) };
}

/**
 * Takes a stop off every track that lists it and out of the world. On each track the legs either
 * side of it merge, read from the derived train: the dot just behind the train joins its leg to
 * the train's, and the train has covered it, so no train ever goes back.
 */
function withoutStop(world: World, id: string, now: number): World {
  const byId = stopsById(world);
  const kept = new Map<string, { leg: number; seconds: number }>();
  const tracks = world.tracks.map((track) => {
    const index = track.stops.indexOf(id);
    if (index < 0) return track;
    const state = trainState(track, byId, now);
    const leg = index < state.leg ? state.leg - 1 : state.leg;
    if (!state.parked) {
      const behind = index === state.leg - 1 ? legSeconds(trackRoute(track, byId), index) : 0;
      kept.set(track.id, { leg, seconds: state.seconds + behind });
    }
    return { ...track, stops: track.stops.filter((s) => s !== id), train: { ...track.train, leg } };
  });
  const after: World = { ...world, tracks, stops: world.stops.filter((s) => s.id !== id) };
  const afterById = stopsById(after);
  return {
    ...after,
    tracks: after.tracks.map((track) => {
      const k = kept.get(track.id);
      if (!k) return track;
      return { ...track, train: rebase(k.leg, k.seconds, legSeconds(trackRoute(track, afterById), k.leg), now) };
    }),
  };
}

export function reduce(world: World, action: Action): World {
  switch (action.type) {
    case 'newTrack': {
      const { id, goalId, title, origin, now } = action;
      if (world.tracks.some((t) => t.id === id) || world.stops.some((s) => s.id === goalId)) return world;
      const goal: Stop = {
        id: goalId,
        title,
        shape: 'square',
        size: 'large',
        x: origin.x + DEFAULT_GOAL_SECONDS,
        y: origin.y,
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
      const home = found.find(({ track, index }) => index === track.stops.length - 1)?.track;
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
      if (found.some(({ track }) => trainState(track, byId, now).parked)) return world;
      return withoutStop(world, id, now);
    }

    case 'complete': {
      const { trackId, now } = action;
      const track = world.tracks.find((t) => t.id === trackId);
      const byId = stopsById(world);
      const next = track && nextIndex(track, byId);
      if (!track || next == null) return world;
      const doneId = track.stops[next];
      // A line whose next stop this is departs too; where it lies further ahead, the train
      // passes through it later.
      const tracks = world.tracks.map((t) => {
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
      const { trackId, now } = action;
      const track = world.tracks.find((t) => t.id === trackId);
      if (!track) return world;
      const byId = stopsById(world);
      // Legs are the derived trains': a train that rolled through a stop done elsewhere has it
      // just behind, the same as one sent on from it.
      const legOf = (t: Track) => trainState(t, byId, now).leg;
      const id = track.stops[legOf(track) - 1];
      if (id === undefined || !byId.get(id)?.done) return world;
      // Every project line must take the stop back: it is ahead of that train or the dot just
      // behind it. Two or more behind on any line, it cannot. The day line follows its projects.
      const lines = tracksOf(world, id).filter(({ track: t }) => !t.day || t.id === trackId);
      const behind = new Set(lines.filter(({ track: t, index }) => index === legOf(t) - 1).map(({ track: t }) => t.id));
      if (lines.some(({ track: t, index }) => !behind.has(t.id) && index < legOf(t))) return world;
      const stops = world.stops.map((s) => (s.id === id ? { ...s, done: false } : s));
      const after = stopsById({ ...world, stops });
      return {
        tracks: world.tracks.map((t) => {
          if (!behind.has(t.id)) return t;
          const i = t.stops.indexOf(id);
          const length = legSeconds(trackRoute(t, after), i);
          return { ...t, train: rebase(i, length, length, now) };
        }),
        stops,
        lastTouched: trackId,
      };
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
  }
}

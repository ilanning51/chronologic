import { distance, type Point } from '../plane/geometry';
import { PALETTE } from './palette';
import { legSeconds, rebase, trackRoute, trainState } from './train';
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
 * holds the train to it, so pulling a stop behind the train and back again loses nothing.
 */
export type Action =
  | { type: 'newTrack'; id: string; goalId: string; title: string; origin: Point; now: number }
  | { type: 'addStop'; trackId: string; id: string; shape: 'circle' | 'triangle'; leg: number; x: number; y: number; now: number; keep?: number }
  | { type: 'move'; id: string; x: number; y: number; now: number; keep?: number } // a pending stop that is not the goal
  | { type: 'moveGoal'; trackId: string; x: number; y: number; now: number; keep?: number; from?: GoalDragStart }
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

/** The track that lists this stop, and the stop's index on it. */
function trackOf(world: World, stopId: string): { track: Track; index: number } | null {
  for (const track of world.tracks) {
    const index = track.stops.indexOf(stopId);
    if (index >= 0) return { track, index };
  }
  return null;
}

function withTrack(world: World, track: Track): Track[] {
  return world.tracks.map((t) => (t.id === track.id ? track : t));
}

/**
 * The one rule everything rests on: an edit never moves the train. `after` is the world with the
 * change applied and the train's leg already right; this keeps the seconds the train had covered
 * in `before` (or `keep`, when the caller knows better) and re-derives its departure time against
 * the leg's new length. A parked train has no leg to cover and is left alone.
 */
function keepTrain(before: World, after: World, trackId: string, now: number, keep?: number): World {
  const was = before.tracks.find((t) => t.id === trackId);
  const track = after.tracks.find((t) => t.id === trackId);
  if (!was || !track || was.train.leg >= was.stops.length) return after;
  const seconds = keep ?? trainState(was, stopsById(before), now).seconds;
  const length = legSeconds(trackRoute(track, stopsById(after)), track.train.leg);
  return { ...after, tracks: withTrack(after, { ...track, train: rebase(track.train.leg, seconds, length, now) }) };
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
      if (track.train.leg >= track.stops.length || leg < track.train.leg || leg >= track.stops.length) return world;
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
      const found = trackOf(world, id);
      const stop = world.stops.find((s) => s.id === id);
      if (!found || !stop || stop.done) return world;
      const { track, index } = found;
      if (index === track.stops.length - 1 || track.train.leg >= track.stops.length) return world;
      const after: World = {
        ...world,
        stops: world.stops.map((s) => (s.id === id ? { ...s, x, y } : s)),
        lastTouched: track.id,
      };
      return keepTrain(world, after, track.id, now, keep);
    }

    case 'moveGoal': {
      const { trackId, x, y, now, keep, from } = action;
      const track = world.tracks.find((t) => t.id === trackId);
      if (!track || track.train.leg >= track.stops.length) return world;
      const goalId = track.stops[track.stops.length - 1];
      const goal = world.stops.find((s) => s.id === goalId);
      if (!goal || goal.done) return world;
      // With a snapshot every move scales the drag's starting points; without one, today's.
      const T = from?.train ?? trainState(track, stopsById(world), now).at;
      const before = distance(T, from?.goal ?? goal);
      const k = before === 0 ? 1 : distance(T, { x, y }) / before;
      const ahead = new Set(track.stops.slice(track.train.leg, -1));
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
      return keepTrain(world, after, trackId, now, keep);
    }

    case 'edit': {
      const { id, title, shape, size } = action;
      const found = trackOf(world, id);
      if (!found) return world;
      const isGoal = found.index === found.track.stops.length - 1;
      return {
        ...world,
        stops: world.stops.map((s) => {
          if (s.id !== id) return s;
          return {
            ...s,
            ...(title !== undefined ? { title } : {}),
            ...(shape !== undefined && !isGoal ? { shape } : {}),
            ...(size !== undefined ? { size } : {}),
          };
        }),
        lastTouched: found.track.id,
      };
    }

    case 'delete': {
      const { id, now } = action;
      const found = trackOf(world, id);
      if (!found) return world;
      const { track, index } = found;
      if (index === track.stops.length - 1) {
        const gone = new Set(track.stops);
        return {
          tracks: world.tracks.filter((t) => t.id !== track.id),
          stops: world.stops.filter((s) => !gone.has(s.id)),
          lastTouched: world.lastTouched === track.id ? null : world.lastTouched,
        };
      }
      if (track.train.leg >= track.stops.length) return world;
      const leg = index < track.train.leg ? track.train.leg - 1 : track.train.leg;
      // The dot just behind the train joins its leg to the train's, and the train has covered it.
      const behind = index === track.train.leg - 1 ? legSeconds(trackRoute(track, stopsById(world)), index) : 0;
      const keep = trainState(track, stopsById(world), now).seconds + behind;
      const after: World = {
        ...world,
        tracks: withTrack(world, {
          ...track,
          stops: track.stops.filter((s) => s !== id),
          train: { ...track.train, leg },
        }),
        stops: world.stops.filter((s) => s.id !== id),
      };
      return keepTrain(world, after, track.id, now, keep);
    }

    case 'complete': {
      const { trackId, now } = action;
      const track = world.tracks.find((t) => t.id === trackId);
      if (!track || track.train.leg >= track.stops.length) return world;
      const doneId = track.stops[track.train.leg];
      return {
        tracks: withTrack(world, { ...track, train: { leg: track.train.leg + 1, departedAt: now } }),
        stops: world.stops.map((s) => (s.id === doneId ? { ...s, done: true } : s)),
        lastTouched: trackId,
      };
    }

    case 'undo': {
      const { trackId, now } = action;
      const track = world.tracks.find((t) => t.id === trackId);
      if (!track) return world;
      const i = track.train.leg - 1;
      const stop = i >= 0 ? world.stops.find((s) => s.id === track.stops[i]) : undefined;
      if (!stop || !stop.done) return world;
      const stops = world.stops.map((s) => (s.id === stop.id ? { ...s, done: false } : s));
      const length = legSeconds(trackRoute(track, stopsById({ ...world, stops })), i);
      return {
        tracks: withTrack(world, { ...track, train: rebase(i, length, length, now) }),
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

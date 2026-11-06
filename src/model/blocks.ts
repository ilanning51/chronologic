import { endOf, slideTo } from './arrive';
import { dayFor, dayWith, defaultLength, freshDayBudget, isDayEnd, offOtherDays, withStopBeforeEnd } from './day';
import { dayOf, endOfDate, startOfDate } from './days';
import { timeLeftAny } from './train';
import type { Stop, Track, World } from './types';

/**
 * How far above its first stop a day the week window made starts, and below its last its end
 * square sits, in world units: a short stroke at the zoom the plane opens at.
 */
export const PLACED_GAP = 12_000;

function withTrack(world: World, track: Track): World {
  return { ...world, tracks: world.tracks.map((t) => (t.id === track.id ? track : t)) };
}

/** Whether a block ending then belongs to this date: after its midnight, up to and at the next. */
function endsOn(date: string, end: number): boolean {
  return end > startOfDate(date) && end <= endOfDate(date);
}

/**
 * The day's stops the train has still to reach, put in the order they arrive. Stops the train is
 * past keep their places; budgets and lengths move with their stops. When the stop the day train
 * heads for changes, it sets off for the new one on a fresh budget.
 */
function inArrivalOrder(world: World, dayId: string, now: number): World {
  const day = world.tracks.find((t) => t.id === dayId);
  if (!day?.day) return world;
  const plan = day.day;
  const from = plan.held ? 0 : day.train.leg;
  const last = day.stops.length - 1;
  if (from >= last) return world;
  const byId = new Map(world.stops.map((s) => [s.id, s]));
  const ends = day.stops.map((id, i) => (i >= from && i < last ? endOf(world, byId.get(id)!, now) : 0));
  const order = Array.from({ length: last - from }, (_, i) => from + i).sort((a, b) => ends[a] - ends[b]);
  const permute = <T,>(xs: T[]) => [...xs.slice(0, from), ...order.map((i) => xs[i]), ...xs.slice(last)];
  const stops = permute(day.stops);
  if (stops.every((id, i) => id === day.stops[i])) return world;
  const sorted: Track = { ...day, stops, day: { ...plan, budgets: permute(plan.budgets), lengths: permute(plan.lengths) } };
  const after = withTrack(world, sorted);
  return !plan.held && stops[from] !== day.stops[from] ? freshDayBudget(after, dayId, now) : after;
}

/** A day the window made keeps its start just above its first stop and its end square just below its last. */
function refit(world: World, dayId: string): World {
  const day = world.tracks.find((t) => t.id === dayId);
  if (!day?.day?.placed || day.stops.length < 2) return world;
  const byId = new Map(world.stops.map((s) => [s.id, s]));
  const first = byId.get(day.stops[0])!;
  const last = byId.get(day.stops[day.stops.length - 2])!;
  const end = day.stops[day.stops.length - 1];
  return {
    ...withTrack(world, { ...day, origin: { x: first.x, y: first.y - PLACED_GAP } }),
    stops: world.stops.map((s) => (s.id === end ? { ...s, x: last.x, y: last.y + PLACED_GAP } : s)),
  };
}

/** A pending stop some project lists, and not a day's end square: the only kind a block can be. */
function blockable(world: World, stop: Stop | undefined): stop is Stop {
  return (
    stop !== undefined &&
    !stop.done &&
    !isDayEnd(world, stop.id) &&
    world.tracks.some((t) => !t.day && t.stops.includes(stop.id))
  );
}

export interface PlaceAction {
  stopId: string;
  date: string;
  end: number;
  length: number;
  now: number;
  /** The ids a new day line and its end square take, when the date has none yet. */
  dayId: string;
  endId: string;
}

/**
 * Puts a stop on a date's day line as a block ending at `end`: the stop slides along its line until
 * its train arrives then, or as near as the line allows. A landing outside the date is refused.
 * The stop comes off any other day; the date's day is made if it has none, held if it is ahead.
 */
export function place(world: World, a: PlaceAction): World {
  const stop = world.stops.find((s) => s.id === a.stopId);
  if (!blockable(world, stop)) return world;
  const slide = slideTo(world, a.stopId, a.end, a.now);
  if (!slide || !endsOn(a.date, slide.end)) return world;
  const existing = dayFor(slide.world, a.date);
  // A day parked past its end square is finished: nothing goes behind it.
  if (existing && !existing.day!.held && existing.train.leg >= existing.stops.length) return world;
  let w = offOtherDays(slide.world, [a.stopId], a.now, existing?.id);
  const day = dayFor(w, a.date);
  let dayId: string;
  if (day?.stops.includes(a.stopId)) {
    dayId = day.id;
    const i = day.stops.indexOf(a.stopId);
    w = withTrack(w, { ...day, day: { ...day.day!, lengths: day.day!.lengths.map((l, j) => (j === i ? a.length : l)) } });
  } else if (day) {
    dayId = day.id;
    w = withTrack(w, withStopBeforeEnd(day, a.stopId, a.length));
  } else {
    if (w.tracks.some((t) => t.id === a.dayId) || w.stops.some((s) => s.id === a.endId)) return world;
    dayId = a.dayId;
    const held = a.date > dayOf(a.now);
    const point = slide.point;
    const square: Stop = { id: a.endId, title: '', shape: 'square', size: 'small', x: point.x, y: point.y + PLACED_GAP, done: false };
    const track: Track = {
      id: a.dayId,
      color: 0,
      origin: { x: point.x, y: point.y - PLACED_GAP },
      stops: [a.stopId, a.endId],
      train: { leg: 0, departedAt: a.now },
      target: 'goal',
      day: {
        date: a.date,
        budgets: [held ? 0 : timeLeftAny(w, a.stopId, a.now), 0],
        lengths: [a.length, defaultLength(square)],
        ...(held ? { held: true as const } : {}),
        placed: true,
      },
    };
    w = { ...w, tracks: [...w.tracks, track], stops: [...w.stops, square] };
  }
  w = refit(inArrivalOrder(w, dayId, a.now), dayId);
  return { ...w, lastTouched: dayId };
}

/**
 * Moves or stretches a block: its stop slides until its train arrives at the new end, and the block
 * keeps the new length. It stays on its day wherever the end lands. A done stop's block stays put.
 */
export function moveBlock(world: World, a: { stopId: string; end: number; length: number; now: number }): World {
  const stop = world.stops.find((s) => s.id === a.stopId);
  const day = dayWith(world, a.stopId);
  if (!day || !blockable(world, stop)) return world;
  const slide = slideTo(world, a.stopId, a.end, a.now);
  if (!slide) return world;
  const here = dayWith(slide.world, a.stopId)!;
  const i = here.stops.indexOf(a.stopId);
  const lengths = here.day!.lengths.map((l, j) => (j === i ? a.length : l));
  const w = withTrack(slide.world, { ...here, day: { ...here.day!, lengths } });
  return { ...refit(inArrivalOrder(w, here.id, a.now), here.id), lastTouched: here.id };
}

/** Takes a block off its day. The stop stays where the block put it; a day left empty goes. */
export function unplace(world: World, a: { stopId: string; now: number }): World {
  const day = dayWith(world, a.stopId);
  if (!day || isDayEnd(world, a.stopId)) return world;
  const w = refit(offOtherDays(world, [a.stopId], a.now), day.id);
  // A day that went took lastTouched with it, in clearDay.
  return { ...w, lastTouched: w.tracks.some((t) => t.id === day.id) ? day.id : w.lastTouched };
}

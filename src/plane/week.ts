import { arrivalOf, endOf, governingLine } from '../model/arrive';
import { dayFor, dayWith, isDayEnd } from '../model/day';
import { addDays, dayOf, endOfDate, parseDate, startOfDate } from '../model/days';
import { nextIndex, trainState } from '../model/train';
import type { Shape, World } from '../model/types';

/** How tall an hour is on the day plane, as in the Figma screen. */
export const PX_PER_HOUR = 48;
/** The whole day: always 24 rows, laid out by the wall clock. */
export const DAY_HEIGHT = 24 * PX_PER_HOUR;
/** Every time the hand sets lands on a quarter hour. */
export const SNAP_MINUTES = 15;
/** The shortest a block can be, in seconds. */
export const MIN_LENGTH = SNAP_MINUTES * 60;
/** A block this tall or taller shows its start and end times. */
export const TIMES_AT_PX = 40;
/** A block drawn shorter than this is drawn this tall, so it can still be seen and held. */
export const MIN_BLOCK_PX = 16;

const LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Monday 0 to Sunday 6. */
function weekday(date: string): number {
  return (parseDate(date).getDay() + 6) % 7;
}

/** The Monday of the calendar week the date falls in. */
export function mondayOf(date: string): string {
  return addDays(date, -weekday(date));
}

/** The seven dates of the week that starts on this Monday. */
export function weekDates(monday: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** The day's abbreviation: Mon to Sun. */
export function dayLabel(date: string): string {
  return LABELS[weekday(date)];
}

/** A week named by how many weeks it is from this one. */
export function weekName(offset: number): string {
  if (offset === 0) return 'This week';
  if (offset === 1) return 'Next week';
  if (offset === -1) return 'Last week';
  return offset > 0 ? `In ${offset} weeks` : `${-offset} weeks ago`;
}

/** How many weeks from this Monday to that one. */
export function weeksBetween(from: string, to: string): number {
  return Math.round((startOfDate(to) - startOfDate(from)) / (7 * 86_400_000));
}

/** The height of a moment on a date's plane, by its wall clock; before the day is the top, after it the bottom. */
export function yOf(date: string, ms: number): number {
  if (ms <= startOfDate(date)) return 0;
  if (ms >= endOfDate(date)) return DAY_HEIGHT;
  const t = new Date(ms);
  return (t.getHours() + t.getMinutes() / 60 + t.getSeconds() / 3600 + t.getMilliseconds() / 3_600_000) * PX_PER_HOUR;
}

/** The moment at a height on a date's plane, read as a wall-clock hour and minute. */
export function timeAt(date: string, y: number): number {
  const minutes = (Math.min(Math.max(y, 0), DAY_HEIGHT) / PX_PER_HOUR) * 60;
  const d = parseDate(date);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, minutes).getTime();
}

/** The quarter hour nearest a height, as a moment. */
export function snapAt(date: string, y: number): number {
  const quarter = (PX_PER_HOUR * SNAP_MINUTES) / 60;
  return timeAt(date, Math.round(Math.min(Math.max(y, 0), DAY_HEIGHT) / quarter) * quarter);
}

/** The now line's height on today; none on any other day. */
export function nowY(date: string, now: number): number | null {
  return dayOf(now) === date ? yOf(date, now) : null;
}

/**
 * A block's time on the twelve-hour clock, as its row reads: "9:00", "12:30". Rounded to the
 * minute, since a train due at 11:00 may arrive a moment either side of it.
 */
export function clock(ms: number): string {
  const t = new Date(Math.round(ms / 60_000) * 60_000);
  return `${t.getHours() % 12 || 12}:${String(t.getMinutes()).padStart(2, '0')}`;
}

/** An hour row's label: "12 AM" to "11 PM". */
export function hourLabel(hour: number): string {
  return `${hour % 12 || 12} ${hour < 12 ? 'AM' : 'PM'}`;
}

/** The colour of the line a stop belongs to: the line that reaches it first, or for a done stop its first project. */
function colorOf(world: World, stopId: string, now: number): number | null {
  const line = governingLine(world, stopId, now)?.track ?? world.tracks.find((t) => !t.day && t.stops.includes(stopId));
  return line ? line.color : null;
}

export interface BlockView {
  stopId: string;
  color: number | null;
  shape: Shape;
  title: string;
  done: boolean;
  /** Its train is waiting at it, so its end is now. */
  waiting: boolean;
  /** When the block starts and ends, in ms: its end is the stop's arrival, or when it was done. */
  start: number;
  end: number;
  length: number;
  top: number;
  height: number;
  clippedTop: boolean;
  clippedBottom: boolean;
  /** Which side-by-side lane it takes among the blocks it overlaps, and how many there are. */
  lane: number;
  lanes: number;
}

/**
 * Everything drawn for the blocks of a date, in the day's order. A block stays on the day it was
 * placed on: where its end drifts outside the day, it is drawn cut off at that edge. A done block
 * ends when its stop was done, and is drawn only on the day that falls in.
 */
export function blocksOn(world: World, date: string, now: number): BlockView[] {
  const day = dayFor(world, date);
  if (!day?.day) return [];
  const byId = new Map(world.stops.map((s) => [s.id, s]));
  const blocks: BlockView[] = [];
  day.stops.forEach((id, i) => {
    const stop = byId.get(id);
    if (!stop || isDayEnd(world, id)) return;
    const length = day.day!.lengths[i];
    const end = endOf(world, stop, now);
    if (stop.done && dayOf(end) !== date && end !== endOfDate(date)) return;
    const start = end - length * 1000;
    let top = yOf(date, start);
    let bottom = yOf(date, end);
    if (bottom - top < MIN_BLOCK_PX) {
      if (bottom >= DAY_HEIGHT) top = DAY_HEIGHT - MIN_BLOCK_PX;
      else bottom = Math.min(DAY_HEIGHT, top + MIN_BLOCK_PX);
      if (bottom - top < MIN_BLOCK_PX) top = bottom - MIN_BLOCK_PX;
    }
    blocks.push({
      stopId: id,
      color: colorOf(world, id, now),
      shape: stop.shape,
      title: stop.title,
      done: stop.done,
      waiting: !stop.done && end === now,
      start,
      end,
      length,
      top,
      height: bottom - top,
      clippedTop: start < startOfDate(date),
      clippedBottom: end > endOfDate(date),
      lane: 0,
      lanes: 1,
    });
  });
  return inLanes(blocks);
}

/**
 * Overlapping blocks share the width side by side, since across the plane means nothing. Blocks
 * that overlap, directly or through another, form a cluster; each takes the first lane free at
 * its top, and every block in the cluster counts the cluster's lanes.
 */
function inLanes(blocks: BlockView[]): BlockView[] {
  const byTop = [...blocks].sort((a, b) => a.top - b.top || a.end - b.end);
  const lane = new Map<BlockView, number>();
  const lanes = new Map<BlockView, number>();
  let cluster: BlockView[] = [];
  let clusterBottom = -Infinity;
  const close = () => {
    const count = Math.max(1, ...cluster.map((b) => lane.get(b)! + 1));
    for (const b of cluster) lanes.set(b, count);
    cluster = [];
  };
  for (const block of byTop) {
    if (block.top >= clusterBottom) {
      close();
      clusterBottom = -Infinity;
    }
    const taken = new Set(cluster.filter((b) => b.top + b.height > block.top).map((b) => lane.get(b)));
    let free = 0;
    while (taken.has(free)) free++;
    lane.set(block, free);
    cluster.push(block);
    clusterBottom = Math.max(clusterBottom, block.top + block.height);
  }
  close();
  return blocks.map((b) => ({ ...b, lane: lane.get(b)!, lanes: lanes.get(b)! }));
}

export interface Candidate {
  stopId: string;
  color: number;
  shape: Shape;
  title: string;
  /** The goal of a line with nothing else on it yet, named in muted capitals. */
  sketch: boolean;
  arrival: number;
}

/**
 * What can be planned next: for each line still running, its first pending stop at or after its
 * train's next that is on no day, soonest first, each stop once.
 */
export function candidates(world: World, now: number): Candidate[] {
  const byId = new Map(world.stops.map((s) => [s.id, s]));
  const found = new Map<string, Candidate>();
  for (const track of world.tracks) {
    if (track.day || trainState(track, byId, now).parked) continue;
    const from = nextIndex(track, byId);
    if (from === null) continue;
    for (let i = from; i < track.stops.length; i++) {
      const stop = byId.get(track.stops[i])!;
      if (stop.done || dayWith(world, stop.id)) continue;
      if (!found.has(stop.id)) {
        found.set(stop.id, {
          stopId: stop.id,
          color: track.color,
          shape: stop.shape,
          title: stop.title,
          sketch: track.stops.length === 1,
          arrival: arrivalOf(world, stop.id, now),
        });
      }
      break;
    }
  }
  return [...found.values()].sort((a, b) => a.arrival - b.arrival);
}

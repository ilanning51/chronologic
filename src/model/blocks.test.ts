import { describe, expect, test } from 'vitest';
import { createStore } from '../store/store';
import { arrivalOf } from './arrive';
import { dayOf } from './days';
import { reduce } from './reducer';
import { timeLeftAny, trainState } from './train';
import type { Shape, Size, World } from './types';

const S = 1000;
const at = (d: number, h: number, min = 0) => new Date(2026, 10, d, h, min).getTime();
/** Friday 6 November 2026, noon. */
const now = at(6, 12);

/**
 * Two project lines, each running a day and more per leg so their stops fall on the days ahead.
 * t1 from (0, 0): Alpha, Bravo, then its goal. t2 from (0, 50000): Charlie, then its goal.
 * Both trains set off 500 s ago.
 */
function world(): World {
  const stop = (id: string, x: number, y: number, shape: Shape = 'circle', size: Size = 'medium') => ({
    id,
    title: id,
    shape,
    size,
    x,
    y,
    done: false,
  });
  return {
    tracks: [
      { id: 't1', color: 0, origin: { x: 0, y: 0 }, stops: ['alpha', 'bravo', 'g1'], train: { leg: 0, departedAt: now - 500 * S }, target: 'goal' },
      { id: 't2', color: 1, origin: { x: 0, y: 50000 }, stops: ['charlie', 'g2'], train: { leg: 0, departedAt: now - 500 * S }, target: 'goal' },
    ],
    stops: [
      stop('alpha', 100000, 0),
      stop('bravo', 300000, 0, 'triangle', 'small'),
      stop('g1', 600000, 0, 'square', 'large'),
      stop('charlie', 120000, 50000),
      stop('g2', 600000, 50000, 'square', 'large'),
    ],
    lastTouched: null,
  };
}

const trackOf = (w: World, id: string) => w.tracks.find((t) => t.id === id)!;
const stopOf = (w: World, id: string) => w.stops.find((s) => s.id === id)!;
const dayOn = (w: World, date: string) => w.tracks.find((t) => t.day?.date === date);
const place = (w: World, stopId: string, date: string, end: number, length: number, ids = { dayId: 'd', endId: 'e' }, when = now) =>
  reduce(w, { type: 'place', stopId, date, end, length, now: when, ...ids });
const near = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThanOrEqual(S);

describe('placing a block', () => {
  test("on tomorrow at 10 to 11 makes tomorrow's held day line, and the stop arrives at 11", () => {
    const next = place(world(), 'alpha', '2026-11-07', at(7, 11), 3600);
    const day = dayOn(next, '2026-11-07')!;
    expect(day.stops).toEqual(['alpha', 'e']);
    expect(day.day).toMatchObject({ lengths: [3600, 1800], held: true, placed: true });
    near(arrivalOf(next, 'alpha', now), at(7, 11));
    expect(next.lastTouched).toBe('d');
    // The day line starts above its stop and its end square sits below it.
    const alpha = stopOf(next, 'alpha');
    expect(day.origin.x).toBe(alpha.x);
    expect(day.origin.y).toBeLessThan(alpha.y);
    expect(stopOf(next, 'e')).toMatchObject({ shape: 'square', size: 'small', x: alpha.x });
  });

  test('a second block earlier in the day goes before the first', () => {
    const one = place(world(), 'alpha', '2026-11-07', at(7, 11), 3600);
    const two = place(one, 'charlie', '2026-11-07', at(7, 9, 30), 1800, { dayId: 'x', endId: 'y' });
    expect(dayOn(two, '2026-11-07')!.stops).toEqual(['charlie', 'alpha', 'e']);
    expect(dayOn(two, '2026-11-07')!.day!.lengths).toEqual([1800, 3600, 1800]);
    near(arrivalOf(two, 'charlie', now), at(7, 9, 30));
  });

  test('placing a stop planned for one day onto another takes it off the first, which goes when empty', () => {
    const sat = place(world(), 'alpha', '2026-11-07', at(7, 11), 3600);
    const sun = place(sat, 'alpha', '2026-11-08', at(8, 11), 3600, { dayId: 'd8', endId: 'e8' });
    expect(dayOn(sun, '2026-11-07')).toBeUndefined();
    expect(sun.stops.map((s) => s.id)).not.toContain('e');
    expect(dayOn(sun, '2026-11-08')!.stops).toEqual(['alpha', 'e8']);
  });

  test('placing a stop whose train waits at it sets the train rolling to arrive at the block end', () => {
    const w = world();
    const later = now + 200000 * S;
    expect(trainState(trackOf(w, 't1'), new Map(w.stops.map((s) => [s.id, s])), later).waiting).toBe(true);
    const end = later + 3 * 3600 * S;
    const next = place(w, 'alpha', dayOf(end), end, 3600, { dayId: 'd', endId: 'e' }, later);
    near(arrivalOf(next, 'alpha', later), end);
    expect(trainState(trackOf(next, 't1'), new Map(next.stops.map((s) => [s.id, s])), later).waiting).toBe(false);
  });

  test('a stop that cannot arrive on that day is refused', () => {
    const w = world();
    // Bravo comes after Alpha, which arrives on Saturday afternoon: nothing on Friday is reachable.
    expect(place(w, 'bravo', '2026-11-06', at(6, 20), 1800)).toBe(w);
  });

  test('placing on today makes a running day line whose train shadows at once', () => {
    const w = world();
    const end = at(6, 20);
    const next = place(w, 'alpha', '2026-11-06', end, 3600);
    const day = dayOn(next, '2026-11-06')!;
    expect(day.day!.held).toBeUndefined();
    expect(day.train).toEqual({ leg: 0, departedAt: now });
    expect(day.day!.budgets[0]).toBe(timeLeftAny(next, 'alpha', now));
  });

  test('a done stop, a day end square, or a stop on no project is refused', () => {
    const w = world();
    w.stops = w.stops.map((s) => (s.id === 'alpha' ? { ...s, done: true } : s));
    expect(place(w, 'alpha', '2026-11-07', at(7, 11), 3600)).toBe(w);
    expect(place(w, 'nope', '2026-11-07', at(7, 11), 3600)).toBe(w);
    const placed = place(world(), 'charlie', '2026-11-07', at(7, 11), 3600);
    expect(place(placed, 'e', '2026-11-08', at(8, 11), 3600, { dayId: 'q', endId: 'r' })).toBe(placed);
  });

  test('a finished today, its end square passed, takes no more blocks', () => {
    const today = place(world(), 'alpha', '2026-11-06', at(6, 20), 3600);
    const later = now + 60 * S;
    const alphaDone = reduce(today, { type: 'complete', trackId: 't1', now: later });
    const finished = reduce(alphaDone, { type: 'complete', trackId: 'd', now: later });
    const day = dayOn(finished, '2026-11-06')!;
    expect(day.train.leg).toBe(day.stops.length);
    expect(place(finished, 'charlie', '2026-11-06', at(6, 22), 1800, undefined, later)).toBe(finished);
  });

  test('a new day whose ids are taken is refused, not overwritten', () => {
    const w = world();
    expect(place(w, 'alpha', '2026-11-07', at(7, 11), 3600, { dayId: 't2', endId: 'e' })).toBe(w);
    expect(place(w, 'alpha', '2026-11-07', at(7, 11), 3600, { dayId: 'd', endId: 'g1' })).toBe(w);
  });

  test('placing a stop again on its own date moves it there, once, with its new length', () => {
    const once = place(world(), 'alpha', '2026-11-07', at(7, 11), 3600);
    const again = place(once, 'alpha', '2026-11-07', at(7, 15), 1800, { dayId: 'x', endId: 'y' });
    const days = again.tracks.filter((t) => t.day);
    expect(days).toHaveLength(1);
    expect(days[0].stops).toEqual(['alpha', 'e']);
    expect(days[0].day!.lengths).toEqual([1800, 1800]);
    near(arrivalOf(again, 'alpha', now), at(7, 15));
  });

  test('a block may end exactly at midnight, the last moment of its day, but not a moment after', () => {
    const w = world();
    const midnight = at(8, 0);
    const placed = place(w, 'alpha', '2026-11-07', midnight, 3600);
    expect(dayOn(placed, '2026-11-07')!.stops).toEqual(['alpha', 'e']);
    expect(place(w, 'alpha', '2026-11-07', midnight + 1, 3600)).toBe(w);
  });

  test('a place is one step undo takes back whole, and redo puts back', () => {
    const w = world();
    const store = createStore(w);
    store.dispatch({ type: 'place', stopId: 'alpha', date: '2026-11-07', end: at(7, 11), length: 3600, now, dayId: 'd', endId: 'e' });
    const placed = store.getState();
    store.undo();
    expect(store.getState()).toBe(w);
    store.redo();
    expect(store.getState()).toBe(placed);
  });
});

describe('moving and stretching a block', () => {
  const planned = () => place(place(world(), 'alpha', '2026-11-07', at(7, 11), 3600), 'charlie', '2026-11-07', at(7, 9, 30), 1800);

  test('moving a block to 14:00 slides its stop there, and the day follows arrival order', () => {
    const next = reduce(planned(), { type: 'moveBlock', stopId: 'charlie', end: at(7, 14), length: 1800, now });
    near(arrivalOf(next, 'charlie', now), at(7, 14));
    expect(dayOn(next, '2026-11-07')!.stops).toEqual(['alpha', 'charlie', 'e']);
    expect(dayOn(next, '2026-11-07')!.day!.lengths).toEqual([3600, 1800, 1800]);
  });

  test('stretching keeps the start and moves the end and the arrival', () => {
    const next = reduce(planned(), { type: 'moveBlock', stopId: 'alpha', end: at(7, 11, 30), length: 5400, now });
    near(arrivalOf(next, 'alpha', now), at(7, 11, 30));
    const day = dayOn(next, '2026-11-07')!;
    expect(day.day!.lengths[day.stops.indexOf('alpha')]).toBe(5400);
  });

  test('moving a block on a hand-drawn day leaves where that day starts and ends alone', () => {
    const w = world();
    w.tracks.push({
      id: 'h',
      color: 0,
      origin: { x: 5000, y: -20000 },
      stops: ['alpha', 'hend'],
      train: { leg: 0, departedAt: now },
      target: 'goal',
      day: { date: '2026-11-07', budgets: [0, 0], lengths: [3600, 1800], held: true },
    });
    w.stops.push({ id: 'hend', title: '', shape: 'square', size: 'small', x: 250000, y: 30000, done: false });
    const next = reduce(w, { type: 'moveBlock', stopId: 'alpha', end: at(7, 14), length: 3600, now });
    near(arrivalOf(next, 'alpha', now), at(7, 14));
    expect(trackOf(next, 'h').origin).toEqual({ x: 5000, y: -20000 });
    expect(stopOf(next, 'hend')).toEqual(stopOf(w, 'hend'));
  });

  test("a done stop's block does not move", () => {
    const w = planned();
    w.stops = w.stops.map((s) => (s.id === 'alpha' ? { ...s, done: true, doneAt: now } : s));
    expect(reduce(w, { type: 'moveBlock', stopId: 'alpha', end: at(7, 15), length: 3600, now })).toBe(w);
  });

  test('placing on today after its blocks are done heads the waiting day train for the new stop', () => {
    const today = place(world(), 'alpha', '2026-11-06', at(6, 20), 3600);
    const later = now + 60 * S;
    const done = reduce(today, { type: 'complete', trackId: 't1', now: later });
    expect(dayOn(done, '2026-11-06')!.train.leg).toBe(1);
    const next = place(done, 'charlie', '2026-11-06', at(6, 22), 1800, undefined, later);
    const day = dayOn(next, '2026-11-06')!;
    expect(day.stops).toEqual(['alpha', 'charlie', 'e']);
    expect(day.train).toEqual({ leg: 1, departedAt: later });
    expect(day.day!.budgets[1]).toBe(timeLeftAny(next, 'charlie', later));
    expect(day.day!.budgets[1]).toBeGreaterThan(0);
  });

  test("on today, moving the second block before the first heads the day train for it on a fresh budget", () => {
    const today = place(place(world(), 'alpha', '2026-11-06', at(6, 20), 3600), 'charlie', '2026-11-06', at(6, 22), 1800);
    expect(dayOn(today, '2026-11-06')!.stops).toEqual(['alpha', 'charlie', 'e']);
    const later = now + 60 * S;
    const next = reduce(today, { type: 'moveBlock', stopId: 'charlie', end: at(6, 18), length: 1800, now: later });
    const day = dayOn(next, '2026-11-06')!;
    expect(day.stops).toEqual(['charlie', 'alpha', 'e']);
    expect(day.train).toEqual({ leg: 0, departedAt: later });
    expect(day.day!.budgets[0]).toBe(timeLeftAny(next, 'charlie', later));
  });
});

describe('taking a block off', () => {
  test('the stop stays where it is and leaves its day; a day left empty goes', () => {
    const w = place(world(), 'alpha', '2026-11-07', at(7, 11), 3600);
    const next = reduce(w, { type: 'unplace', stopId: 'alpha', now });
    expect(stopOf(next, 'alpha')).toEqual(stopOf(w, 'alpha'));
    expect(trackOf(next, 't1')).toEqual(trackOf(w, 't1'));
    expect(dayOn(next, '2026-11-07')).toBeUndefined();
    expect(reduce(next, { type: 'unplace', stopId: 'alpha', now })).toBe(next);
  });

  test('a day with another block keeps it, its start and end refitted', () => {
    const w = place(place(world(), 'alpha', '2026-11-07', at(7, 11), 3600), 'charlie', '2026-11-07', at(7, 9, 30), 1800);
    const next = reduce(w, { type: 'unplace', stopId: 'charlie', now });
    const day = dayOn(next, '2026-11-07')!;
    expect(day.stops).toEqual(['alpha', 'e']);
    expect(day.origin.x).toBe(stopOf(next, 'alpha').x);
  });
});

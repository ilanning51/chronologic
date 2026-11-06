import { describe, expect, test } from 'vitest';
import { arrivalOf } from '../model/arrive';
import { reduce } from '../model/reducer';
import type { Shape, Size, World } from '../model/types';
import {
  blocksOn,
  candidates,
  DAY_HEIGHT,
  dayLabel,
  mondayOf,
  nowY,
  PX_PER_HOUR,
  snapAt,
  timeAt,
  weekDates,
  weekName,
  yOf,
} from './week';

const S = 1000;
const at = (d: number, h: number, min = 0) => new Date(2026, 10, d, h, min).getTime();
const now = at(6, 12);

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
      { id: 't3', color: 2, origin: { x: 0, y: 90000 }, stops: ['dream'], train: { leg: 0, departedAt: now - 500 * S }, target: 'goal' },
    ],
    stops: [
      stop('alpha', 100000, 0),
      stop('bravo', 300000, 0, 'triangle', 'small'),
      stop('g1', 600000, 0, 'square', 'large'),
      stop('charlie', 120000, 50000),
      stop('g2', 600000, 50000, 'square', 'large'),
      stop('dream', 900000, 90000, 'square', 'large'),
    ],
    lastTouched: null,
  };
}
const place = (w: World, stopId: string, date: string, end: number, length: number, ids = { dayId: 'd', endId: 'e' }) =>
  reduce(w, { type: 'place', stopId, date, end, length, now, ...ids });

describe('the week', () => {
  test('runs Monday to Sunday', () => {
    expect(mondayOf('2026-11-05')).toBe('2026-11-02');
    expect(mondayOf('2026-11-08')).toBe('2026-11-02');
    expect(mondayOf('2026-11-09')).toBe('2026-11-09');
    expect(weekDates('2026-11-02')).toEqual(['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08']);
    expect(dayLabel('2026-11-06')).toBe('Fri');
  });

  test('is named by how far it is from this one', () => {
    expect(weekName(0)).toBe('This week');
    expect(weekName(1)).toBe('Next week');
    expect(weekName(-1)).toBe('Last week');
    expect(weekName(3)).toBe('In 3 weeks');
    expect(weekName(-2)).toBe('2 weeks ago');
  });
});

describe('the day plane', () => {
  test('maps the wall clock to height and back, snapping to the quarter hour', () => {
    expect(yOf('2026-11-07', at(7, 9, 30))).toBe(9.5 * PX_PER_HOUR);
    expect(yOf('2026-11-07', at(6, 23))).toBe(0);
    expect(yOf('2026-11-07', at(8, 0))).toBe(DAY_HEIGHT);
    expect(timeAt('2026-11-07', 9.5 * PX_PER_HOUR)).toBe(at(7, 9, 30));
    expect(snapAt('2026-11-07', (9 + 40 / 60) * PX_PER_HOUR)).toBe(at(7, 9, 45));
    expect(snapAt('2026-11-07', (9 + 50 / 60) * PX_PER_HOUR)).toBe(at(7, 9, 45));
    expect(snapAt('2026-11-07', -10)).toBe(at(7, 0));
  });

  test('has a now line on today only', () => {
    expect(nowY('2026-11-06', now)).toBe(12 * PX_PER_HOUR);
    expect(nowY('2026-11-07', now)).toBeNull();
  });
});

describe('blocks', () => {
  test('a block ending at 11:00 with an hour of length starts at 10:00, coloured by its line', () => {
    const w = place(world(), 'alpha', '2026-11-07', at(7, 11), 3600);
    const [block] = blocksOn(w, '2026-11-07', now);
    expect(block).toMatchObject({ stopId: 'alpha', color: 0, shape: 'circle', title: 'alpha', done: false, lanes: 1, lane: 0 });
    expect(Math.abs(block.end - at(7, 11))).toBeLessThanOrEqual(S);
    expect(block.start).toBe(block.end - 3600 * S);
    expect(block.top).toBeCloseTo(10 * PX_PER_HOUR, 0);
    expect(block.height).toBeCloseTo(PX_PER_HOUR, 0);
    expect(blocksOn(w, '2026-11-08', now)).toEqual([]);
  });

  test('two overlapping blocks share the width in two lanes; one alone has it all', () => {
    const w = place(place(world(), 'alpha', '2026-11-07', at(7, 11), 7200), 'charlie', '2026-11-07', at(7, 10, 30), 3600);
    const lanes = blocksOn(w, '2026-11-07', now).map((b) => [b.stopId, b.lane, b.lanes]);
    // In day order: Charlie ends first. Alpha starts first, so it takes the first lane.
    expect(lanes).toEqual([
      ['charlie', 1, 2],
      ['alpha', 0, 2],
    ]);
  });

  test('a block whose arrival drifted past midnight is clipped at the bottom and keeps its true end', () => {
    const w = place(world(), 'alpha', '2026-11-07', at(7, 23), 3600);
    const moved = reduce(w, { type: 'moveBlock', stopId: 'alpha', end: at(8, 0, 30), length: 3600, now });
    const [block] = blocksOn(moved, '2026-11-07', now);
    expect(block.clippedBottom).toBe(true);
    expect(block.top + block.height).toBe(DAY_HEIGHT);
    expect(Math.abs(block.end - at(8, 0, 30))).toBeLessThanOrEqual(S);
  });

  test("a done stop's block ends when it was done, muted, and only on that day", () => {
    const w = place(world(), 'alpha', '2026-11-06', at(6, 20), 3600);
    const done = reduce(w, { type: 'complete', trackId: 't1', now: at(6, 15) });
    const [block] = blocksOn(done, '2026-11-06', at(6, 16));
    expect(block).toMatchObject({ stopId: 'alpha', done: true, end: at(6, 15) });
    const elsewhere = structuredClone(done);
    elsewhere.tracks.find((t) => t.day)!.day!.date = '2026-11-07';
    expect(blocksOn(elsewhere, '2026-11-07', at(6, 16))).toEqual([]);
  });

  test('a stop whose train waits at it on today ends at now', () => {
    const w = place(world(), 'alpha', '2026-11-06', at(6, 20), 3600);
    const later = arrivalOf(w, 'alpha', now) + 600 * S;
    const [block] = blocksOn(w, '2026-11-06', later);
    expect(block.end).toBe(later);
    expect(block.waiting).toBe(true);
  });
});

describe('candidates', () => {
  test("list each line's next stop on no day, soonest first, skip parked lines, and mark a sketch's goal", () => {
    const w = world();
    expect(candidates(w, now).map((c) => [c.stopId, c.sketch])).toEqual([
      ['alpha', false],
      ['charlie', false],
      ['dream', true],
    ]);
    const placed = place(w, 'alpha', '2026-11-07', at(7, 11), 3600);
    expect(candidates(placed, now).map((c) => c.stopId)).toEqual(['charlie', 'bravo', 'dream']);
    const parked = structuredClone(w);
    parked.tracks[2].train.leg = 1;
    expect(candidates(parked, now).map((c) => c.stopId)).not.toContain('dream');
  });
});

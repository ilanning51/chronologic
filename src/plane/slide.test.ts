import { describe, expect, test } from 'vitest';
import { reduce } from '../model/reducer';
import type { Shape, Size, World } from '../model/types';
import { drawnBetween } from './slide';

const S = 1000;
const at = (d: number, h: number, min = 0) => new Date(2026, 10, d, h, min).getTime();
/** Friday 6 November 2026, noon. */
const now = at(6, 12);

/** Two project lines: t1 through Alpha and Bravo to g1, t2 through Charlie to g2. */
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

const stopOf = (w: World, id: string) => w.stops.find((s) => s.id === id)!;
const trackOf = (w: World, id: string) => w.tracks.find((t) => t.id === id);
const place = (w: World, stopId: string, end: number, ids = { dayId: 'd', endId: 'e' }) =>
  reduce(w, { type: 'place', stopId, date: '2026-11-07', end, length: 3600, now, ...ids });
const point = (p: { x: number; y: number }) => ({ x: p.x, y: p.y });
const halfway = (a: { x: number; y: number }, b: { x: number; y: number }) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

describe('the world drawn while the map slides into place', () => {
  test('a placed stop stands where it was at the start, where it is at the end, and halfway at the half', () => {
    const opening = world();
    const live = place(opening, 'alpha', at(7, 11));
    const from = stopOf(opening, 'alpha');
    const to = stopOf(live, 'alpha');
    expect(point(to)).not.toEqual(point(from));
    expect(point(stopOf(drawnBetween(opening, live, 0), 'alpha'))).toEqual(point(from));
    expect(point(stopOf(drawnBetween(opening, live, 0.5), 'alpha'))).toEqual(halfway(from, to));
    expect(drawnBetween(opening, live, 1)).toBe(live);
  });

  test("a placed day's start and end square, refitted since, slide the same way", () => {
    const opening = place(world(), 'alpha', at(7, 11));
    const live = place(opening, 'charlie', at(7, 9), { dayId: 'x', endId: 'y' });
    const fromOrigin = trackOf(opening, 'd')!.origin;
    const toOrigin = trackOf(live, 'd')!.origin;
    expect(toOrigin).not.toEqual(fromOrigin);
    const half = drawnBetween(opening, live, 0.5);
    expect(trackOf(half, 'd')!.origin).toEqual(halfway(fromOrigin, toOrigin));
    expect(point(stopOf(half, 'e'))).toEqual(halfway(stopOf(opening, 'e'), stopOf(live, 'e')));
  });

  test('what did not move is drawn from the live world itself', () => {
    const opening = world();
    const live = place(opening, 'alpha', at(7, 11));
    const half = drawnBetween(opening, live, 0.5);
    expect(stopOf(half, 'g2')).toBe(stopOf(live, 'g2'));
    expect(trackOf(half, 't2')).toBe(trackOf(live, 't2'));
    expect(drawnBetween(live, live, 0)).toBe(live);
  });

  test('a day line made since the start is left out until the slide ends', () => {
    const opening = world();
    const live = place(opening, 'alpha', at(7, 11));
    expect(trackOf(drawnBetween(opening, live, 0), 'd')).toBeUndefined();
    expect(trackOf(drawnBetween(opening, live, 0.99), 'd')).toBeUndefined();
    expect(trackOf(drawnBetween(opening, live, 1), 'd')).toBeDefined();
    // Its project stop still slides along its project line.
    expect(trackOf(drawnBetween(opening, live, 0), 't1')!.stops).toContain('alpha');
    expect(point(stopOf(drawnBetween(opening, live, 0), 'alpha'))).toEqual(point(stopOf(opening, 'alpha')));
  });

  test('a day line that gained a stop since keeps its live stops, drawn through where they stood', () => {
    const opening = place(world(), 'alpha', at(7, 11));
    const live = place(opening, 'charlie', at(7, 9), { dayId: 'x', endId: 'y' });
    const held = drawnBetween(opening, live, 0);
    expect(trackOf(held, 'd')!.stops).toEqual(['charlie', 'alpha', 'e']);
    expect(point(stopOf(held, 'charlie'))).toEqual(point(stopOf(opening, 'charlie')));
  });

  test('a stop deleted since the start is gone at once', () => {
    const opening = world();
    const live = reduce(opening, { type: 'delete', id: 'bravo', now });
    for (const t of [0, 0.5, 1]) expect(drawnBetween(opening, live, t).stops.map((s) => s.id)).not.toContain('bravo');
  });

  test('trains and done marks are always the live ones', () => {
    const opening = place(world(), 'alpha', at(7, 11));
    const moved = place(opening, 'alpha', at(7, 15));
    const live: World = {
      ...moved,
      tracks: moved.tracks.map((t) => (t.id === 't1' ? { ...t, train: { leg: 1, departedAt: now } } : t)),
      stops: moved.stops.map((s) => (s.id === 'alpha' ? { ...s, done: true, doneAt: now } : s)),
    };
    const held = drawnBetween(opening, live, 0);
    expect(trackOf(held, 't1')!.train).toBe(trackOf(live, 't1')!.train);
    expect(stopOf(held, 'alpha')).toMatchObject({ done: true, doneAt: now });
  });
});

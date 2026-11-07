import { describe, expect, test } from 'vitest';
import type { StopView, TrackView } from '../plane/layout';
import { labelPlaces, stopsOnce } from './stopsOnce';

const stopAt = (lane: { x: number; y: number }, ring = true): StopView => ({
  id: 's',
  x: 100,
  y: 100,
  shape: 'circle',
  size: 'medium',
  done: false,
  title: 's',
  label: true,
  next: false,
  goal: false,
  projectGoal: false,
  terminus: false,
  landmark: false,
  ring,
  lane,
  crowd: 0,
});
const viewOf = (id: string, stop: StopView) => ({ id, color: 0, finished: false, day: false, tomorrow: false, sketch: false, stops: [stop] }) as unknown as TrackView;

test('an interchange whose lines pass side by side is joined across their lanes', () => {
  const [placed] = stopsOnce([viewOf('a', stopAt({ x: 100, y: 94 })), viewOf('b', stopAt({ x: 100, y: 106 }))]);
  expect(placed.link).toEqual({ dx: 0, dy: 0, length: 12, angle: 90, marks: [{ dx: 0, dy: -6 }, { dx: 0, dy: 6 }] });
});

test('a transfer has one disc a lane, in order across, however many lines share a lane', () => {
  const [placed] = stopsOnce([
    viewOf('a', stopAt({ x: 112, y: 100 })),
    viewOf('b', stopAt({ x: 100, y: 100 })),
    viewOf('c', stopAt({ x: 88, y: 100 })),
    viewOf('d', stopAt({ x: 100, y: 100 })),
  ]);
  expect(placed.link!.length).toBe(24);
  expect(placed.link!.marks.map((m) => m.dx)).toHaveLength(3);
  expect(Math.abs(placed.link!.marks[0].dx - placed.link!.marks[2].dx)).toBe(24);
  expect(placed.link!.marks[1].dx).toBe(0);
});

test('an interchange whose lines all pass through its point has no transfer, only its ring', () => {
  const [placed] = stopsOnce([viewOf('a', stopAt({ x: 100, y: 100 })), viewOf('b', stopAt({ x: 100, y: 100 }))]);
  expect(placed.link).toBeUndefined();
});

test("a transfer's name is set clear of the whole capsule, not only the disc at its point", () => {
  const lines = [viewOf('a', stopAt({ x: 100, y: 88 })), viewOf('b', stopAt({ x: 100, y: 112 }))].map((v) => ({ ...v, behind: [], segments: [] }));
  const placed = stopsOnce(lines);
  const place = labelPlaces(placed, lines).get('s')!;
  expect(place.side).toBe('right');
  // The capsule's discs are one line wide, so its right edge is half a line, the capsule's margin and the gap past the point.
  expect(place.dx).toBeGreaterThan(6);
  expect(place.dy).toBeLessThan(0);
});

describe('which line a stop speaks for', () => {
  const stopView = (id: string, next: boolean): StopView => ({ ...stopAt({ x: 0, y: 0 }, false), id, shape: 'square', title: id, label: false, next });
  const view = (id: string, stops: StopView[]) => ({ id, color: 0, finished: false, day: false, tomorrow: false, sketch: false, stops }) as unknown as TrackView;

  test("a ring speaks for its project even when it is the life line's next and the project has an earlier step", () => {
    const project = view('t1', [stopView('step', true), stopView('ring', false)]);
    const life = view('life', [stopView('ring', true)]);
    const placed = stopsOnce([life, project], 'life');
    const ring = placed.find((p) => p.stop.id === 'ring')!;
    expect(ring.track).toBe('t1');
    expect(ring.stop.next).toBe(false);
  });

  test('a bare marker speaks for the life line', () => {
    const life = view('life', [stopView('marker', true)]);
    const marker = stopsOnce([life], 'life').find((p) => p.stop.id === 'marker')!;
    expect(marker.track).toBe('life');
    expect(marker.stop.next).toBe(true);
  });

  test('an interchange of two projects still speaks for the first line it is next on', () => {
    const a = view('a', [stopView('shared', false)]);
    const b = view('b', [stopView('shared', true)]);
    expect(stopsOnce([a, b], 'life').find((p) => p.stop.id === 'shared')!.track).toBe('b');
  });
});

test('a done goal on the life line is its landmark, not a terminus; on a project line alone it stays a terminus', () => {
  const done = (over: Partial<StopView>): StopView => ({ ...stopAt({ x: 100, y: 100 }, false), done: true, ...over });
  const [both] = stopsOnce([viewOf('p', done({ terminus: true })), viewOf('life', done({ landmark: true }))], 'life');
  expect(both.stop).toMatchObject({ landmark: true, terminus: false });
  const [alone] = stopsOnce([viewOf('p', done({ terminus: true }))]);
  expect(alone.stop).toMatchObject({ landmark: false, terminus: true });
});

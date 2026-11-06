import { describe, expect, test } from 'vitest';
import { drawnOnPlane } from '../model/day';
import { dayOf } from '../model/days';
import { dayState, trainState } from '../model/train';
import type { Stop, Track, World } from '../model/types';
import { running, twoLines, withDay, withLife, withWeek } from '../test/fixtures';
import { MAX_SCALE, worldToScreen } from './camera';
import { CLIP_MARGIN_PX } from './clip';
import { layoutTrack } from './layout';

function stop(id: string, x: number, y: number, over: Partial<Stop> = {}): Stop {
  return { id, title: id, shape: 'circle', size: 'medium', x, y, done: false, ...over };
}
function trackOf(ids: string[], leg = 0): Track {
  return { id: 't', color: 2, origin: { x: 0, y: 0 }, stops: ids, train: { leg, departedAt: 0 }, target: 'next' };
}
function worldOf(track: Track, stops: Stop[]): World {
  return { tracks: [track], stops, lastTouched: null };
}
const viewport = { w: 1000, h: 800 };

test('a track lays out in screen space with constant shapes, a dot for done, and the train on the path', () => {
  const a = stop('a', 1000, 0);
  const g = stop('g', 1000, 2000, { shape: 'square', size: 'large', done: true });
  const camera = { x: 100, y: 100, scale: 0.1 };
  const track = trackOf(['a', 'g']);
  const v = layoutTrack(track, worldOf(track, [a, g]), camera, 500_000, viewport);

  expect(v.id).toBe('t');
  expect(v.color).toBe(2);
  expect(v.finished).toBe(false);
  expect(v.day).toBe(false);
  expect(v.sketch).toBe(false);
  expect(v.anyInView).toBe(true);
  // origin (100,100) -> a (200,100) -> g (200,300): the route is axis-aligned here. The train,
  // halfway along the first leg, cuts it: behind it is travelled, ahead is still to come.
  expect(v.behind).toEqual([[{ x: 100, y: 100 }, { x: 150, y: 100 }]]);
  expect(v.segments).toEqual([
    [{ x: 150, y: 100 }, { x: 200, y: 100 }],
    [{ x: 200, y: 100 }, { x: 200, y: 300 }],
  ]);
  expect(v.stops).toEqual([
    { id: 'a', x: 200, y: 100, shape: 'circle', size: 'medium', done: false, title: 'a', label: true, next: true, goal: false, projectGoal: false, terminus: false, landmark: false, ring: false, lane: { x: 200, y: 100 }, crowd: 0 },
    { id: 'g', x: 200, y: 300, shape: 'square', size: 'large', done: true, title: 'g', label: true, next: false, goal: true, projectGoal: true, terminus: true, landmark: false, ring: false, lane: { x: 200, y: 300 }, crowd: 0 },
  ]);
  // halfway through leg 0 (1000 s): world (500, 0) -> screen (150, 100).
  expect(v.train).toMatchObject({ x: 150, y: 100, waiting: false, parked: false });
  expect(v.train.angle).toBeCloseTo(0);
});

test('nothing off screen reaches the view and no NaN is produced at max zoom with a month of track', () => {
  const month = 2_592_000;
  const near = stop('near', 10, 0);
  const far = stop('far', 1_000_000, 0);
  const goal = stop('goal', month, 0);
  const camera = { x: 0, y: 0, scale: MAX_SCALE };
  const track = trackOf(['near', 'far', 'goal']);
  const v = layoutTrack(track, worldOf(track, [near, far, goal]), camera, 0, viewport);

  const inGrown = (p: { x: number; y: number }) =>
    Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= -200 && p.x <= 1200 && p.y >= -200 && p.y <= 1000;
  expect(v.segments.length).toBeGreaterThan(0);
  for (const [p, q] of v.segments) {
    expect(inGrown(p)).toBe(true);
    expect(inGrown(q)).toBe(true);
  }
  expect(v.stops.map((s) => s.id)).toEqual(['near']);
  expect(v.stops.every(inGrown)).toBe(true);
  expect(Number.isFinite(v.train.x)).toBe(true);
  expect(v.anyInView).toBe(true);
});

// Everything in the fixtures fits on screen at this scale.
const wide = { x: 100, y: 100, scale: 0.1 };
const s = 1000;
const ringOf = (v: ReturnType<typeof layoutTrack>, id: string) => v.stops.find((x) => x.id === id)!.ring;

test('a stop on two lines is a ring, and a done one is a dot', () => {
  const w = twoLines();
  const t1 = layoutTrack(w.tracks[0], w, wide, 0, viewport);
  const t2 = layoutTrack(w.tracks[1], w, wide, 0, viewport);
  expect(ringOf(t1, 'shared')).toBe(true);
  expect(ringOf(t2, 'shared')).toBe(true);
  expect(ringOf(t1, 'dentist')).toBe(false);
  expect(ringOf(t2, 'goal2')).toBe(false);

  w.stops.find((x) => x.id === 'shared')!.done = true;
  expect(ringOf(layoutTrack(w.tracks[0], w, wide, 0, viewport), 'shared')).toBe(false);

  // The day line counts as a line: Dentist is a ring once a day goes through it.
  const d = withDay(dayOf(0));
  expect(ringOf(layoutTrack(d.tracks[0], d, wide, 0, viewport), 'dentist')).toBe(true);
});

test('a goal-only line is a sketch, and the day line never is', () => {
  const w = running();
  w.tracks[0].stops = ['wristband'];
  expect(layoutTrack(w.tracks[0], w, wide, 0, viewport).sketch).toBe(true);

  const d = withDay();
  const day = d.tracks.find((t) => t.day)!;
  day.stops = ['dayEnd'];
  const v = layoutTrack(day, d, wide, 0, viewport);
  expect(v.day).toBe(true);
  expect(v.sketch).toBe(false);
  expect(layoutTrack(d.tracks[0], d, wide, 0, viewport)).toMatchObject({ day: false, sketch: false });
});

test('the day line lays out its train by the shadow rule', () => {
  // At 500 s t1 is halfway to Dentist in time, so the day train is halfway down its 400 s leg.
  // Its own stored clock (departed at 0) would have it waiting at Dentist already.
  const w = withDay();
  const day = w.tracks.find((t) => t.day)!;
  const shadow = dayState(day, w, 500 * s);
  const own = trainState(day, new Map(w.stops.map((x) => [x.id, x])), 500 * s);
  expect(own.waiting).toBe(true);

  const v = layoutTrack(day, w, wide, 500 * s, viewport);
  const at = worldToScreen(wide, shadow.at);
  expect(v.train).toEqual({ x: at.x, y: at.y, angle: shadow.angle, waiting: false, parked: false });
  expect(v.train.y).toBeCloseTo(worldToScreen(wide, { x: 0, y: -200 }).y);
  expect(v.finished).toBe(false);

  day.train = { leg: day.stops.length, departedAt: 0 };
  expect(layoutTrack(day, w, wide, 500 * s, viewport).finished).toBe(true);
});

test('the crowd sits on the waiting stop only', () => {
  const crowdOf = (v: ReturnType<typeof layoutTrack>) => Object.fromEntries(v.stops.map((x) => [x.id, x.crowd]));
  const w = running();
  // Moving: no crowd anywhere.
  expect(crowdOf(layoutTrack(w.tracks[0], w, wide, 500 * s, viewport))).toEqual({ dentist: 0, wristband: 0 });
  // Waiting at Dentist for two and a half leg-times.
  expect(crowdOf(layoutTrack(w.tracks[0], w, wide, 3500 * s, viewport))).toEqual({ dentist: 2, wristband: 0 });

  // t1 crowds Dentist, but the day line through it shows none: an interchange shows one crowd.
  const d = withDay();
  const day = d.tracks.find((t) => t.day)!;
  expect(crowdOf(layoutTrack(d.tracks[0], d, wide, 3500 * s, viewport)).dentist).toBe(2);
  expect(Object.values(crowdOf(layoutTrack(day, d, wide, 3500 * s, viewport)))).toEqual([0, 0, 0]);
});

// A scale at which one grid square is a day: a large circle is below the level, a small
// triangle is at it. Screen x is world x / 2000 + 100.
const dayCamera = { x: 100, y: 100, scale: 0.0005 };
const atScreenX = (x: number) => (x - 100) / 0.0005;

test('below its level a stop is left out of the view, but the line still routes through it', () => {
  const a = stop('a', atScreenX(200), 0);
  const b = stop('b', atScreenX(400), 0, { size: 'large' });
  const c = stop('c', atScreenX(600), 0, { shape: 'triangle', size: 'small' });
  const g = stop('g', atScreenX(800), 0, { shape: 'square' });
  const track = trackOf(['a', 'b', 'c', 'g']);
  const v = layoutTrack(track, worldOf(track, [a, b, c, g]), dayCamera, 1000, viewport);

  expect(v.stops.map((s) => s.id)).toEqual(['a', 'c', 'g']);
  expect(v.segments).toContainEqual([{ x: 200, y: 100 }, { x: 400, y: 100 }]);
});

test('the next stop and the goal show whatever their shape, and so does a kept stop', () => {
  const a = stop('a', atScreenX(200), 0, { size: 'small' });
  const b = stop('b', atScreenX(400), 0, { size: 'small' });
  const g = stop('g', atScreenX(800), 0, { shape: 'square', size: 'small' });
  const track = trackOf(['a', 'b', 'g']);
  const world = worldOf(track, [a, b, g]);

  expect(layoutTrack(track, world, dayCamera, 1000, viewport).stops.map((s) => s.id)).toEqual(['a', 'g']);
  expect(layoutTrack(track, world, dayCamera, 1000, viewport, new Set(['b'])).stops.map((s) => s.id)).toEqual(['a', 'b', 'g']);
});

test('a done dot follows the level of the stop it was', () => {
  const d = stop('d', atScreenX(200), 0, { done: true });
  const a = stop('a', atScreenX(400), 0);
  const g = stop('g', atScreenX(800), 0, { shape: 'square' });
  const track = trackOf(['d', 'a', 'g'], 1);
  const v = layoutTrack(track, worldOf(track, [d, a, g]), dayCamera, 1000, viewport);

  expect(v.stops.map((s) => s.id)).toEqual(['a', 'g']);
});

test('labels make room among the stops that are drawn, not the hidden ones', () => {
  const a = stop('a', atScreenX(200), 0);
  const b = stop('b', atScreenX(290), 0);
  const c = stop('c', atScreenX(350), 0, { shape: 'triangle', size: 'small' });
  const g = stop('g', atScreenX(800), 0, { shape: 'square' });
  const track = trackOf(['a', 'b', 'c', 'g']);
  const v = layoutTrack(track, worldOf(track, [a, b, c, g]), dayCamera, 1000, viewport);

  expect(v.stops.find((s) => s.id === 'c')?.label).toBe(true);
});

test('the view carries the origin in screen pixels', () => {
  const camera = { x: 100, y: 100, scale: 0.1 };
  const track = trackOf(['a']);
  const v = layoutTrack(track, worldOf(track, [stop('a', 1000, 0)]), camera, 0, viewport);
  expect(v.origin).toEqual(worldToScreen(camera, { x: 0, y: 0 }));
});

test('a waiting train cuts the line at its stop, and a parked one has travelled it all', () => {
  const a = stop('a', 1000, 0);
  const g = stop('g', 1000, 2000, { shape: 'square', size: 'large' });
  const camera = { x: 100, y: 100, scale: 0.1 };
  const waiting = layoutTrack(trackOf(['a', 'g']), worldOf(trackOf(['a', 'g']), [a, g]), camera, 5_000_000, viewport);
  expect(waiting.behind).toEqual([[{ x: 100, y: 100 }, { x: 200, y: 100 }]]);
  expect(waiting.segments).toEqual([[{ x: 200, y: 100 }, { x: 200, y: 300 }]]);

  const done = [stop('a', 1000, 0, { done: true }), stop('g', 1000, 2000, { shape: 'square', size: 'large', done: true })];
  const parked = trackOf(['a', 'g'], 2);
  const v = layoutTrack(parked, worldOf(parked, done), camera, 5_000_000, viewport);
  expect(v.finished).toBe(true);
  expect(v.segments).toEqual([]);
  expect(v.behind).toEqual([
    [{ x: 100, y: 100 }, { x: 200, y: 100 }],
    [{ x: 200, y: 100 }, { x: 200, y: 300 }],
  ]);
  expect(v.anyInView).toBe(true);
});

describe('day lines on the plane', () => {
  const noon = new Date(2026, 10, 1, 12).getTime();
  const later = (w: World) => {
    const moved = structuredClone(w);
    moved.tracks.find((t) => t.id === 'day2')!.day!.date = '2026-11-03';
    return moved;
  };

  test("today's is drawn as now, tomorrow's muted and thin with its train at its start, and later ones not at all", () => {
    const w = withWeek('2026-11-01');
    const view = (id: string) => layoutTrack(w.tracks.find((t) => t.id === id)!, w, wide, noon, viewport);
    expect(view('day')).toMatchObject({ day: true, tomorrow: false });
    expect(view('day2')).toMatchObject({ day: true, tomorrow: true });
    expect(view('t1')).toMatchObject({ day: false, tomorrow: false });
    expect({ x: view('day2').train.x, y: view('day2').train.y }).toEqual(view('day2').origin);
    expect(w.tracks.map((t) => drawnOnPlane(t, '2026-11-01'))).toEqual([true, true, true, true]);
    expect(later(w).tracks.map((t) => drawnOnPlane(t, '2026-11-01'))).toEqual([true, true, true, false]);
  });

  test('a stop is a ring only for the lines drawn through it', () => {
    // Goal 2 ends its project and starts tomorrow's day line.
    const w = withWeek('2026-11-01');
    const t2 = (world: World) => layoutTrack(world.tracks[1], world, wide, noon, viewport);
    expect(t2(w).stops.find((s) => s.id === 'goal2')?.ring).toBe(true);
    expect(t2(later(w)).stops.find((s) => s.id === 'goal2')?.ring).toBe(false);
  });
});

describe('the widest zooms draw only the life line', () => {
  // 3e-6 px per second puts the grid at 3 months, 1e-6 at 1 year, 1e-4 at 1 hour.
  const at = (scale: number) => ({ x: 100, y: 400, scale });
  const ids = (v: ReturnType<typeof layoutTrack>) => v.stops.map((x) => x.id);

  test('at 3 months a project line lays out to nothing, even with a pinned stop, and the life line keeps its squares', () => {
    const w = withLife();
    const project = layoutTrack(w.tracks[0], w, at(3e-6), 0, viewport, new Set(['dentist']));
    expect(project).toMatchObject({ stops: [], segments: [], behind: [], anyInView: false });
    const life = layoutTrack(w.tracks[1], w, at(3e-6), 0, viewport);
    expect(ids(life)).toEqual(['start', 'wristband', 'far']);
    expect(life.segments.length + life.behind.length).toBeGreaterThan(0);
  });

  test('at 1 year the life line drops its rings and keeps bare markers and done squares', () => {
    const w = withLife();
    expect(ids(layoutTrack(w.tracks[1], w, at(1e-6), 0, viewport))).toEqual(['start', 'far']);
    w.stops.find((x) => x.id === 'wristband')!.done = true;
    w.stops.find((x) => x.id === 'start')!.done = true;
    expect(ids(layoutTrack(w.tracks[1], w, at(1e-6), 0, viewport))).toEqual(['start', 'wristband', 'far']);
  });

  test('below 3 months every line lays out as before', () => {
    const w = withLife();
    expect(ids(layoutTrack(w.tracks[0], w, at(1e-4), 0, viewport))).toEqual(['dentist', 'wristband']);
    expect(ids(layoutTrack(w.tracks[1], w, at(1e-4), 0, viewport))).toEqual(['start', 'wristband', 'far']);
  });
});

describe('the life line as drawn', () => {
  // Life height -800 at 0.1 puts the line at screen y 420; its origin is at screen x 100.
  const camera = { x: 100, y: 500, scale: 0.1 };
  const life = (w: World) => layoutTrack(w.tracks.find((t) => t.life)!, w, camera, 0, viewport);
  const flat = (v: ReturnType<typeof layoutTrack>) => [...v.behind, ...v.segments];

  test('its road runs edge to edge at its height, and what is behind the train ends at the train', () => {
    const v = life(withLife());
    expect(v.behind[0][0]).toEqual({ x: -CLIP_MARGIN_PX, y: 420 });
    expect(v.segments[v.segments.length - 1][1]).toEqual({ x: viewport.w + CLIP_MARGIN_PX, y: 420 });
    for (const [a, b] of flat(v)) expect([a.y, b.y]).toEqual([420, 420]);
    expect(v.behind[v.behind.length - 1][1]).toEqual({ x: v.train.x, y: v.train.y });
  });

  test('with no stops it is still a road edge to edge, neither finished nor a sketch', () => {
    const w = withLife();
    const track = w.tracks.find((t) => t.life)!;
    track.stops = [];
    track.life = { y: -800, budgets: [] };
    const v = life(w);
    expect(v.finished).toBe(false);
    expect(v.sketch).toBe(false);
    expect(v.life).toBe(true);
    expect(Math.min(...flat(v).map(([a]) => a.x))).toBe(-CLIP_MARGIN_PX);
    expect(Math.max(...flat(v).map(([, b]) => b.x))).toBe(viewport.w + CLIP_MARGIN_PX);
  });

  test('a project line is not the life line', () => {
    const w = withLife();
    expect(layoutTrack(w.tracks[0], w, camera, 0, viewport).life).toBe(false);
  });

  test('a done square is a landmark whose name is kept however close its neighbour', () => {
    const w = withLife();
    w.stops.push({ id: 'near', title: 'Near', shape: 'square', size: 'medium', x: 520, y: -800, done: true });
    w.stops.find((x) => x.id === 'start')!.done = true;
    w.tracks.find((t) => t.life)!.stops = ['start', 'near', 'wristband', 'far'];
    w.tracks.find((t) => t.life)!.life = { y: -800, budgets: [0, 0, 0, 0] };
    const v = life(w);
    const by = (id: string) => v.stops.find((s) => s.id === id)!;
    expect([by('start').landmark, by('near').landmark, by('far').landmark, by('wristband').landmark]).toEqual([true, true, false, false]);
    // Two done squares two pixels apart would thin to one name, were they not landmarks.
    expect([by('start').label, by('near').label]).toEqual([true, true]);
  });

  test("a project's done goal is a terminus, never a landmark", () => {
    const w = withLife();
    w.stops.find((x) => x.id === 'wristband')!.done = true;
    const goal = layoutTrack(w.tracks[0], w, camera, 0, viewport).stops.find((s) => s.id === 'wristband')!;
    expect(goal).toMatchObject({ terminus: true, landmark: false });
  });
});

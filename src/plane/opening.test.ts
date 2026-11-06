import { expect, test } from 'vitest';
import { dayState, legSeconds, trackRoute, trainState } from '../model/train';
import type { Stop, Track, World } from '../model/types';
import { addDays, dayOf } from '../model/days';
import { twoLines, withDay } from '../test/fixtures';
import { fitLeg, HOME, MIN_SCALE } from './camera';
import { openingCamera } from './opening';

const viewport = { w: 900, h: 600 };
const LATE = 10_000_000;

function stop(id: string, x: number, y = 0): Stop {
  return { id, title: id, shape: 'circle', size: 'medium', x, y, done: false };
}

function track(id: string, stops: string[], leg: number, departedAt: number, origin = { x: 0, y: 0 }): Track {
  return { id, color: 0, origin, stops, train: { leg, departedAt }, target: 'goal' };
}

const stops = [stop('a', 1000), stop('b', 3000), stop('c', 0, 5000), stop('d', 0, 9000)];

test('the soonest train is centred and its leg fits a third of the width', () => {
  const world: World = { tracks: [track('t', ['a', 'b'], 0, 0)], stops, lastTouched: null };
  const cam = openingCamera(world, 500_000, viewport);
  expect(cam.scale).toBeCloseTo(fitLeg(1000, viewport.w));
  expect(cam.scale).toBeCloseTo(0.3);
});

test('a waiting train beats a rolling one', () => {
  const rolling = track('r', ['a', 'b'], 0, LATE - 1000);
  const waiting = track('w', ['c', 'd'], 0, 0, { x: 0, y: 0 });
  const world: World = { tracks: [rolling, waiting], stops, lastTouched: null };
  const cam = openingCamera(world, LATE, viewport);
  // The waiting train sits at c (0, 5000); the next leg c -> d is 4000 s long.
  expect(cam.scale).toBeCloseTo(fitLeg(4000, viewport.w));
  expect(cam.x).toBeCloseTo(viewport.w / 2);
  expect(cam.y).toBeCloseTo(viewport.h / 2 - 5000 * cam.scale);
});

test('a train that waits at the goal uses its current leg for the zoom', () => {
  const world: World = { tracks: [track('t', ['a'], 0, 0)], stops, lastTouched: null };
  const cam = openingCamera(world, LATE, viewport);
  expect(cam.scale).toBeCloseTo(fitLeg(1000, viewport.w));
  expect(cam.x).toBeCloseTo(viewport.w / 2 - 1000 * cam.scale);
});

test('a parked track is skipped', () => {
  const parked = track('p', ['a'], 1, 0);
  const rolling = track('r', ['c', 'd'], 0, LATE - 1000);
  const world: World = { tracks: [parked, rolling], stops, lastTouched: null };
  expect(openingCamera(world, LATE, viewport).scale).toBeCloseTo(fitLeg(5000, viewport.w));
});

test('ties go to the last touched track, else the first', () => {
  const first = track('first', ['a'], 0, 0);
  const second = track('second', ['c'], 0, 0);
  const world: World = { tracks: [first, second], stops, lastTouched: 'second' };
  expect(openingCamera(world, LATE, viewport).y).toBeCloseTo(viewport.h / 2 - 5000 * fitLeg(5000, viewport.w));
  const untouched = openingCamera({ ...world, lastTouched: null }, LATE, viewport);
  expect(untouched.scale).toBeCloseTo(fitLeg(1000, viewport.w));
});

test('no unparked track leaves the camera at home', () => {
  expect(openingCamera({ tracks: [], stops: [], lastTouched: null }, 0, viewport)).toEqual(HOME);
  const parked: World = { tracks: [track('p', ['a'], 1, 0)], stops, lastTouched: null };
  expect(openingCamera(parked, 0, viewport)).toEqual(HOME);
});

test('a leg too long for the zoom range is clamped', () => {
  const far = [stop('a', 1e7)];
  const world: World = { tracks: [track('t', ['a'], 0, 0)], stops: far, lastTouched: null };
  expect(openingCamera(world, 1000, viewport).scale).toBe(MIN_SCALE);
});

test('the camera opens on the day train when there is a day', () => {
  // At 0 s Dentist is a whole budget away, so the day train sits at its origin (1000, -400).
  const world = withDay(dayOf(0));
  const byId = new Map(world.stops.map((s) => [s.id, s]));
  const day = world.tracks.find((t) => t.day)!;
  const route = trackRoute(day, byId);
  const atStart = openingCamera(world, 0, viewport);
  expect(atStart.scale).toBeCloseTo(fitLeg(400, viewport.w));
  expect(atStart.x).toBeCloseTo(viewport.w / 2 - 1000 * atStart.scale);
  expect(atStart.y).toBeCloseTo(viewport.h / 2 + 400 * atStart.scale);

  // Partway, it follows the shadow, not any project train.
  const mid = openingCamera(world, 500_000, viewport);
  const midAt = dayState(day, world, 500_000).at;
  expect(mid.x).toBeCloseTo(viewport.w / 2 - midAt.x * mid.scale);
  expect(mid.y).toBeCloseTo(viewport.h / 2 - midAt.y * mid.scale);

  // t1 waits at Dentist, so the day train waits there too, and the next day leg fills the zoom.
  const waiting = openingCamera(world, 1_200_000, viewport);
  expect(dayState(day, world, 1_200_000).waiting).toBe(true);
  expect(waiting.scale).toBeCloseTo(fitLeg(legSeconds(route, 1), viewport.w));
  expect(waiting.x).toBeCloseTo(viewport.w / 2 - 1000 * waiting.scale);
  expect(waiting.y).toBeCloseTo(viewport.h / 2);

  // A parked day is nothing to follow: the camera opens on the soonest project instead.
  day.train = { leg: day.stops.length, departedAt: 0 };
  const withoutDay = { ...world, tracks: world.tracks.filter((t) => !t.day) };
  expect(openingCamera(world, 500_000, viewport)).toEqual(openingCamera(withoutDay, 500_000, viewport));
});

test("tomorrow's day line is not today's: the camera opens as if there were none", () => {
  const world = withDay(addDays(dayOf(0), 1));
  const withoutDay = { ...world, tracks: world.tracks.filter((t) => !t.day) };
  expect(openingCamera(world, 500_000, viewport)).toEqual(openingCamera(withoutDay, 500_000, viewport));
});

test('without a day the camera opens as before', () => {
  // The soonest line's train is centred, its current leg fitting a third of the width.
  const world = twoLines();
  const byId = new Map(world.stops.map((s) => [s.id, s]));
  const t1 = world.tracks[0];
  const cam = openingCamera(world, 500_000, viewport);
  const at = trainState(t1, byId, 500_000).at;
  expect(cam.scale).toBeCloseTo(fitLeg(1000, viewport.w));
  expect(cam.x).toBeCloseTo(viewport.w / 2 - at.x * cam.scale);
  expect(cam.y).toBeCloseTo(viewport.h / 2 - at.y * cam.scale);
  // The earlier tests in this file are the rest of "as before", unchanged.
});

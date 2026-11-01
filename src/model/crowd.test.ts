import { expect, test } from 'vitest';
import { running, withDay } from '../test/fixtures';
import { crowdAt, CROWD_CAP } from './crowd';
import type { World } from './types';

const byIdOf = (w: World) => new Map(w.stops.map((s) => [s.id, s]));
const s = 1000;

test('a crowd grows one per leg-time of waiting, capped at five', () => {
  // t1's first leg, origin to Dentist, is 1000 s; its time runs out at 1000 s.
  const w = running();
  const t1 = w.tracks[0];
  const byId = byIdOf(w);
  expect(crowdAt(t1, byId, 500 * s)).toBe(0); // still moving
  expect(crowdAt(t1, byId, 1000 * s)).toBe(0); // just arrived
  expect(crowdAt(t1, byId, 1999 * s)).toBe(0);
  expect(crowdAt(t1, byId, 2000 * s)).toBe(1);
  expect(crowdAt(t1, byId, 3500 * s)).toBe(2);
  expect(crowdAt(t1, byId, 6000 * s)).toBe(5);
  expect(crowdAt(t1, byId, 100_000 * s)).toBe(CROWD_CAP);
});

test('never on a day line or a zero leg', () => {
  // Dentist on the origin: a leg with no length waits at once, and never crowds.
  const zero = running();
  zero.stops[0].x = 0;
  expect(crowdAt(zero.tracks[0], byIdOf(zero), 100_000 * s)).toBe(0);

  // The day train's own stored clock ran out long ago, but the day line never crowds.
  const w = withDay();
  const day = w.tracks.find((t) => t.day)!;
  expect(crowdAt(day, byIdOf(w), 100_000 * s)).toBe(0);
});

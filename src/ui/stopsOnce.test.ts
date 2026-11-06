import { expect, test } from 'vitest';
import type { StopView, TrackView } from '../plane/layout';
import { stopsOnce } from './stopsOnce';

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
  ring,
  lane,
  crowd: 0,
});
const viewOf = (id: string, stop: StopView) => ({ id, color: 0, finished: false, day: false, tomorrow: false, sketch: false, stops: [stop] }) as unknown as TrackView;

test('an interchange whose lines pass side by side is joined across their lanes', () => {
  const [placed] = stopsOnce([viewOf('a', stopAt({ x: 100, y: 94 })), viewOf('b', stopAt({ x: 100, y: 106 }))]);
  expect(placed.link).toEqual({ dx: 0, dy: 0, length: 12, angle: 90 });
});

test('an interchange whose lines all pass through its point has no transfer, only its ring', () => {
  const [placed] = stopsOnce([viewOf('a', stopAt({ x: 100, y: 100 })), viewOf('b', stopAt({ x: 100, y: 100 }))]);
  expect(placed.link).toBeUndefined();
});

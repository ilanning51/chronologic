import { expect, test } from 'vitest';
import { labelsWithRoom } from './labels';

test('labels go left to right, always-ids first, and a label needs 80 px of room', () => {
  const stops = [
    { id: 'c', x: 150 },
    { id: 'a', x: 0 },
    { id: 'b', x: 50 },
    { id: 'd', x: 160 },
  ];
  // 'd' is always shown, so 'c' (10 px away) loses; 'b' is 50 from 'a', so it loses; 'a' stays.
  expect([...labelsWithRoom(stops, new Set(['d']))].sort()).toEqual(['a', 'd']);
  // With nothing forced: a (0), b too close, c (150) fits, d too close to c.
  expect([...labelsWithRoom(stops, new Set())].sort()).toEqual(['a', 'c']);
  // Exactly 80 px apart is room enough.
  expect([...labelsWithRoom([{ id: 'p', x: 0 }, { id: 'q', x: 80 }], new Set())].sort()).toEqual(['p', 'q']);
});

test('an always-id that is not in the list is ignored', () => {
  expect([...labelsWithRoom([{ id: 'a', x: 0 }], new Set(['ghost']))]).toEqual(['a']);
});

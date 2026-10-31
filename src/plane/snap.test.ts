import { expect, test } from 'vitest';
import { running } from '../test/fixtures';
import { snapToTracks } from './snap';

const NOW = 500_000; // 500 s into the 1000 s leg to Dentist

test('snaps to the nearest path ahead of the train, never behind it or past the goal', () => {
  const world = running();
  // Behind the train on the first leg.
  expect(snapToTracks(world, { x: 200, y: 6 }, NOW, 50)).toBeNull();
  // Ahead of the train on its own leg.
  expect(snapToTracks(world, { x: 700, y: 6 }, NOW, 50)).toEqual({ trackId: 't1', leg: 0, at: { x: 700, y: 0 } });
  // On the leg from Dentist to Wristband.
  expect(snapToTracks(world, { x: 1500, y: 30 }, NOW, 50)).toEqual({ trackId: 't1', leg: 1, at: { x: 1500, y: 0 } });
  // Past the goal.
  expect(snapToTracks(world, { x: 3500, y: 0 }, NOW, 50)).toBeNull();
  // A parked track takes nothing.
  world.tracks[0].train = { leg: 2, departedAt: 0 };
  expect(snapToTracks(world, { x: 1500, y: 0 }, NOW, 50)).toBeNull();
});

test('nothing near returns null', () => {
  expect(snapToTracks(running(), { x: 1500, y: 400 }, NOW, 50)).toBeNull();
});

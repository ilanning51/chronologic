import { expect, test } from 'vitest';
import { timeLeft } from '../model/train';
import { twoLines, withDay } from '../test/fixtures';
import { soonestTrack } from './soonest';

test('the soonest line is the one whose next stop is nearest in time, waiting wins', () => {
  // At 500 s t1 is rolling to Dentist (1000 s leg) and t2 to Shared (1500 s leg): t1 is nearer.
  const world = twoLines();
  const byId = new Map(world.stops.map((s) => [s.id, s]));
  const [t1, t2] = world.tracks;
  expect(timeLeft(t1, 'dentist', byId, 500_000)).toBeLessThan(timeLeft(t2, 'shared', byId, 500_000));
  expect(soonestTrack(world, 500_000)?.id).toBe('t1');

  // t2 departed earlier, so it has less time left than t1 and wins.
  t2.train.departedAt = -1_400_000;
  expect(timeLeft(t2, 'shared', byId, 500_000)).toBeLessThan(timeLeft(t1, 'dentist', byId, 500_000));
  expect(soonestTrack(world, 500_000)?.id).toBe('t2');

  // t1 has barely left while t2 waits at Shared: waiting is 0 left and wins.
  t1.train.departedAt = 1_900_000;
  t2.train.departedAt = 0;
  expect(soonestTrack(world, 2_000_000)?.id).toBe('t2');
});

test('ties go to the line touched last, parked lines and the day never count', () => {
  // Both trains wait at their stops: a tie at 0.
  const world = twoLines();
  expect(soonestTrack(world, 10_000_000)?.id).toBe('t1');
  expect(soonestTrack({ ...world, lastTouched: 't2' }, 10_000_000)?.id).toBe('t2');

  // A parked line never counts, even when it was touched last.
  const parked = twoLines();
  parked.tracks[1].train = { leg: 2, departedAt: 0 };
  expect(soonestTrack({ ...parked, lastTouched: 't2' }, 10_000_000)?.id).toBe('t1');

  // The day is never the soonest line, even while its train is the nearest to a stop.
  const day = withDay();
  expect(soonestTrack({ ...day, lastTouched: 'day' }, 10_000_000)?.id).toBe('t1');
  for (const track of day.tracks) {
    if (!track.day) track.train = { leg: track.stops.length, departedAt: 0 };
  }
  expect(soonestTrack(day, 10_000_000)).toBeNull();
  expect(soonestTrack({ tracks: [], stops: [], lastTouched: null }, 0)).toBeNull();
});

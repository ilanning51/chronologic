import { nextIndex, timeLeft, trainState } from '../model/train';
import type { Track, World } from '../model/types';

/**
 * The project line whose train reaches its next stop soonest. Time, not distance: a waiting
 * train has arrived, so it is 0 away and wins; a rolling one counts what is left of its time,
 * braking included. Ties go to the track touched last, else the first. The day line has no
 * clock of its own, so it never counts; with every project train parked there is none.
 */
export function soonestTrack(world: World, now: number): Track | null {
  const byId = new Map(world.stops.map((s) => [s.id, s]));
  let best: { track: Track; left: number } | null = null;

  for (const track of world.tracks) {
    if (track.day || trainState(track, byId, now).parked) continue;
    const next = nextIndex(track, byId);
    // Rolling through done stops to a done goal: nothing is left to arrive at.
    if (next === null) continue;
    const left = timeLeft(track, track.stops[next], byId, now);
    const touched = track.id === world.lastTouched;
    if (!best || left < best.left || (left === best.left && touched)) best = { track, left };
  }

  return best?.track ?? null;
}

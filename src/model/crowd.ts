import { legSeconds, trackRoute, trainState } from './train';
import type { Stop, Track } from './types';

/** The most dots a crowd shows: past five, longer waiting says nothing new. */
export const CROWD_CAP = 5;

/**
 * How many people have gathered at the stop the train waits at: one for every whole leg-time it
 * has waited past its leg's end, up to five. A leg with no length has no time to measure by, and
 * the day line never crowds, so an interchange shows only its project's crowd.
 */
export function crowdAt(track: Track, byId: Map<string, Stop>, now: number): number {
  if (track.day) return 0;
  const state = trainState(track, byId, now);
  if (!state.waiting || byId.get(track.stops[state.leg])?.done) return 0;
  const planned = legSeconds(trackRoute(track, byId), state.leg);
  if (planned === 0) return 0;
  const waited = (now - state.departedAt) / 1000 - planned;
  return Math.min(CROWD_CAP, Math.floor(waited / planned));
}

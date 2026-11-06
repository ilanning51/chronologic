import { isProject } from '../model/day';
import { dayOf } from '../model/days';
import { legSeconds, stateOf, trackRoute, type TrainState } from '../model/train';
import type { Track, World } from '../model/types';
import { type Camera, centerOn, fitLeg, HOME } from './camera';
import { PROJECT_MIN_SCALE } from './level';
import { soonestTrack } from './soonest';

/**
 * Where the camera starts. With today's day under way, on its day train: the day is the plan, so it
 * is what to look at first. Otherwise on the soonest line's train. Either way zoomed so its leg
 * fills a third of the width. With nothing running the camera stays home.
 */
export function openingCamera(world: World, now: number, viewport: { w: number; h: number }): Camera {
  const byId = new Map(world.stops.map((s) => [s.id, s]));

  const day = world.tracks.find((t) => t.day?.date === dayOf(now));
  if (day) {
    const state = stateOf(day, world, now);
    if (!state.parked) return frame(day, state);
  }

  const track = soonestTrack(world, now);
  return track ? frame(track, stateOf(track, world, now)) : HOME;

  function frame(track: Track, state: TrainState): Camera {
    // A waiting train is about to set off on the next leg; at the last stop there is none.
    const leg = state.waiting && state.leg + 1 < track.stops.length ? state.leg + 1 : state.leg;
    const scale = fitLeg(legSeconds(trackRoute(track, byId), leg), viewport.w);
    // A project is not drawn past the 30-day unit, so a years-long leg frames at that zoom instead.
    return centerOn(HOME, state.at, viewport, isProject(track) ? Math.max(scale, PROJECT_MIN_SCALE) : scale);
  }
}

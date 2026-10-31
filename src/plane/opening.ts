import { invertProgress } from '../model/motion';
import { legSeconds, trackRoute, trainState } from '../model/train';
import type { World } from '../model/types';
import { type Camera, centerOn, fitLeg, HOME } from './camera';

/**
 * Where the camera starts: on the train that will arrive soonest, zoomed so its leg
 * fills a third of the width. A waiting train has arrived, so it counts as zero seconds
 * away; a rolling one is however much of its leg's time is left, so braking counts as
 * time, not distance. Ties go to the track touched last, else the first. With every
 * train parked there is nothing to follow and the camera stays home.
 */
export function openingCamera(world: World, now: number, viewport: { w: number; h: number }): Camera {
  const byId = new Map(world.stops.map((s) => [s.id, s]));
  let best: { eta: number; scale: number; at: { x: number; y: number }; touched: boolean } | null = null;

  for (const track of world.tracks) {
    const state = trainState(track, byId, now);
    if (state.parked) continue;
    const route = trackRoute(track, byId);
    const length = legSeconds(route, state.leg);
    const eta = state.waiting ? 0 : (1 - invertProgress(state.fraction)) * length;
    // A waiting train is about to set off on the next leg; at the goal there is none.
    const leg = state.waiting && state.leg + 1 < track.stops.length ? state.leg + 1 : state.leg;
    const candidate = {
      eta,
      scale: fitLeg(legSeconds(route, leg), viewport.w),
      at: state.at,
      touched: track.id === world.lastTouched,
    };
    if (!best || candidate.eta < best.eta || (candidate.eta === best.eta && candidate.touched && !best.touched)) {
      best = candidate;
    }
  }

  return best ? centerOn(HOME, best.at, viewport, best.scale) : HOME;
}

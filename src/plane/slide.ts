import type { World } from '../model/types';
import type { Point } from './geometry';

const lerp = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

/**
 * The world to draw part of the way, `t` from 0 to 1, from `from` to `to`. Stops and line starts
 * found in both stand between their two places; everything else is `to`'s own, so trains, done
 * marks and stop lists are always live. A line `from` lacked is left out until the end. At 1, or
 * when nothing moved, this is `to` itself.
 */
export function drawnBetween(from: World, to: World, t: number): World {
  if (t >= 1 || from === to) return to;
  const fromStops = new Map(from.stops.map((s) => [s.id, s]));
  const fromTracks = new Map(from.tracks.map((tr) => [tr.id, tr]));
  let changed = false;
  const stops = to.stops.map((s) => {
    const was = fromStops.get(s.id);
    if (!was || (was.x === s.x && was.y === s.y)) return s;
    changed = true;
    return { ...s, ...lerp(was, s, t) };
  });
  const tracks = to.tracks.flatMap((tr) => {
    const was = fromTracks.get(tr.id);
    if (!was) {
      changed = true;
      return [];
    }
    if (was.origin.x === tr.origin.x && was.origin.y === tr.origin.y) return [tr];
    changed = true;
    return [{ ...tr, origin: lerp(was.origin, tr.origin, t) }];
  });
  return changed ? { ...to, stops, tracks } : to;
}

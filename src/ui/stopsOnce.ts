import type { Point } from '../plane/geometry';
import type { StopView, TrackView } from '../plane/layout';

/** The transfer drawn across an interchange's lanes: from the stop's point, its middle, length and angle. */
export interface Link {
  dx: number;
  dy: number;
  length: number;
  angle: number;
}

/** The lanes an interchange's lines pass it in, joined from the two furthest apart; none when they all pass through its point. */
function linkOf(at: Point, lanes: Point[]): Link | undefined {
  let best: [Point, Point] | null = null;
  let far = 1;
  for (const a of lanes) {
    for (const b of lanes) {
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      if (d > far) {
        far = d;
        best = [a, b];
      }
    }
  }
  if (!best) return undefined;
  const [a, b] = best;
  return {
    dx: (a.x + b.x) / 2 - at.x,
    dy: (a.y + b.y) / 2 - at.y,
    length: far,
    angle: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI,
  };
}

/** A stop ready to draw, with the line a tap on it speaks for. */
export interface PlacedStop {
  stop: StopView;
  track: string;
  color: number;
  day: boolean;
  /** Every line through it is done, so it dims. */
  finished: boolean;
  /** Every line through it is a sketch or tomorrow's day, so it is muted. */
  sketch: boolean;
  /** An interchange whose lines pass it side by side: the transfer joining their lanes. */
  link?: Link;
}

/**
 * Each stop once, however many lines list it, so an interchange is one button and one key.
 * It speaks for the first line it is next on, else the first that lists it, so a tap
 * completes it where it can be completed.
 */
export function stopsOnce(views: TrackView[]): PlacedStop[] {
  const byId = new Map<string, { view: TrackView; stop: StopView }[]>();
  for (const view of views) {
    for (const stop of view.stops) byId.set(stop.id, [...(byId.get(stop.id) ?? []), { view, stop }]);
  }
  return [...byId.values()].map((listings) => {
    const { view, stop } = listings.find((l) => l.stop.next) ?? listings[0];
    const link = stop.ring ? linkOf(stop, listings.map((l) => l.stop.lane)) : undefined;
    return {
      stop: {
        ...stop,
        next: listings.some((l) => l.stop.next),
        label: listings.some((l) => l.stop.label),
        // A goal is a goal whichever line its button speaks for.
        projectGoal: listings.some((l) => l.stop.projectGoal),
        terminus: listings.some((l) => l.stop.terminus),
        crowd: Math.max(...listings.map((l) => l.stop.crowd)),
      },
      track: view.id,
      color: view.color,
      day: view.day,
      finished: listings.every((l) => l.view.finished),
      sketch: listings.every((l) => l.view.sketch || l.view.tomorrow),
      ...(link ? { link } : {}),
    };
  });
}

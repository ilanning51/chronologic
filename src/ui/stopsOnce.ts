import type { StopView, TrackView } from '../plane/layout';

/** A stop ready to draw, with the line a tap on it speaks for. */
export interface PlacedStop {
  stop: StopView;
  track: string;
  color: number;
  day: boolean;
  /** Every line through it is done, so it dims. */
  finished: boolean;
  /** Every line through it is a sketch, so it is muted. */
  sketch: boolean;
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
    return {
      stop: {
        ...stop,
        next: listings.some((l) => l.stop.next),
        label: listings.some((l) => l.stop.label),
        crowd: Math.max(...listings.map((l) => l.stop.crowd)),
      },
      track: view.id,
      color: view.color,
      day: view.day,
      finished: listings.every((l) => l.view.finished),
      sketch: listings.every((l) => l.view.sketch),
    };
  });
}

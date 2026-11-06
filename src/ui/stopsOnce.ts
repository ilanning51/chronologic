import type { StopView, TrackView } from '../plane/layout';

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
}

/**
 * Each stop once, however many lines list it, so an interchange is one button and one key.
 * It speaks for the first line it is next on, else the first that lists it, so a tap
 * completes it where it can be completed. The life line (`lifeId`) never speaks for a square a
 * project lists: a ring's tap is its project's, and only a bare marker completes through the life line.
 */
export function stopsOnce(views: TrackView[], lifeId?: string): PlacedStop[] {
  const byId = new Map<string, { view: TrackView; stop: StopView }[]>();
  for (const view of views) {
    for (const stop of view.stops) byId.set(stop.id, [...(byId.get(stop.id) ?? []), { view, stop }]);
  }
  return [...byId.values()].map((listings) => {
    const projects = listings.filter((l) => l.view.id !== lifeId);
    const speaking = projects.length > 0 ? projects : listings;
    const { view, stop } = speaking.find((l) => l.stop.next) ?? speaking[0];
    return {
      stop: {
        ...stop,
        next: speaking.some((l) => l.stop.next),
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
    };
  });
}

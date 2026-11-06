import type { Point } from '../plane/geometry';
import { type LabelItem, type LabelMark, type LabelPlace, placeLabels } from '../plane/labels';
import type { StopView, TrackView } from '../plane/layout';
import { VIGNELLI } from '../plane/vignelli';
import { DISC_PX, TRACK_WIDTH } from '../plane/world';

/**
 * The transfer drawn across an interchange's lanes: from the stop's point, its middle, length and
 * angle, and where each lane's disc sits, from one end to the other.
 */
export interface Link {
  dx: number;
  dy: number;
  length: number;
  angle: number;
  marks: { dx: number; dy: number }[];
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
  // One disc a lane, however many lines share it, in order from a to b.
  const along = (p: Point) => (p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y);
  const marks: Point[] = [];
  for (const p of [...lanes].sort((p, q) => along(p) - along(q))) {
    if (!marks.some((m) => Math.hypot(m.x - p.x, m.y - p.y) < 1)) marks.push(p);
  }
  return {
    dx: (a.x + b.x) / 2 - at.x,
    dy: (a.y + b.y) / 2 - at.y,
    length: far,
    angle: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI,
    marks: marks.map((m) => ({ dx: m.x - at.x, dy: m.y - at.y })),
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

/** The paper ring about a disc, and the capsule a transfer's disc sits in, outline included, in pixels. */
const RING_PX = TRACK_WIDTH * VIGNELLI.discRing;
const CAPSULE_PX = TRACK_WIDTH * (VIGNELLI.capsulePad + VIGNELLI.capsuleOutline);
/** A goal's mural above its disc, as --mural sets it, and the paper between them. */
const MURAL_PX = 72;
const MURAL_GAP_PX = 6;

/** How far a stop's mark reaches from its point each way, and the discs it is drawn as. */
function markOf({ stop, link }: PlacedStop): { extent: LabelItem['mark']; discs: { dx: number; dy: number; r: number }[] } {
  let discs: { dx: number; dy: number; r: number }[];
  if (link) {
    const r = DISC_PX.small / 2 + CAPSULE_PX;
    discs = link.marks.map((m) => ({ ...m, r }));
  } else {
    const disc = stop.done ? DISC_PX[stop.terminus ? 'large' : 'small'] : DISC_PX[stop.size];
    discs = [{ dx: 0, dy: 0, r: disc / 2 + (stop.ring && !stop.done ? CAPSULE_PX : 0) + RING_PX }];
  }
  const extent = {
    left: Math.min(...discs.map((d) => d.dx - d.r)),
    top: Math.min(...discs.map((d) => d.dy - d.r)),
    right: Math.max(...discs.map((d) => d.dx + d.r)),
    bottom: Math.max(...discs.map((d) => d.dy + d.r)),
  };
  // A goal's picture stands above its disc, so no name goes there.
  if (stop.image !== undefined) extent.top = Math.min(extent.top, -(DISC_PX.large / 2 + MURAL_GAP_PX + MURAL_PX));
  return { extent, discs };
}

/**
 * Where every shown name is set, beside its station on the side that covers least of the lines,
 * the other stations and the names already set, as the map sets them.
 */
export function labelPlaces(placed: PlacedStop[], views: TrackView[]): Map<string, LabelPlace> {
  const items: LabelItem[] = [];
  const marks: LabelMark[] = [];
  for (const p of placed) {
    const { extent, discs } = markOf(p);
    for (const d of discs) marks.push({ id: p.stop.id, x: p.stop.x + d.dx, y: p.stop.y + d.dy, r: d.r });
    if (p.stop.label && p.stop.title) {
      items.push({ id: p.stop.id, x: p.stop.x, y: p.stop.y, mark: extent, text: p.stop.title, bold: p.stop.projectGoal });
    }
  }
  const segments = views.flatMap((v) => [...v.behind, ...v.segments]);
  return placeLabels(items, segments, marks);
}

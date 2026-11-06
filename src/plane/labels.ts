import { clipSegment } from './clip';
import type { Point } from './geometry';
import { VIGNELLI } from './vignelli';
import { LABEL_ROOM_PX, TRACK_WIDTH } from './world';

/**
 * Which stops get a label: the `always` ones first, then each other stop from left to right
 * unless a label already shown sits within LABEL_ROOM_PX of it. Crowded stops go unlabeled
 * rather than overlap.
 */
export function labelsWithRoom(stops: { id: string; x: number }[], always: Set<string>): Set<string> {
  const sorted = [...stops].sort((a, b) => a.x - b.x);
  const shown = new Set(sorted.filter((s) => always.has(s.id)).map((s) => s.id));
  const shownX = sorted.filter((s) => shown.has(s.id)).map((s) => s.x);
  for (const s of sorted) {
    if (shown.has(s.id)) continue;
    if (shownX.some((x) => Math.abs(x - s.x) < LABEL_ROOM_PX)) continue;
    shown.add(s.id);
    shownX.push(s.x);
  }
  return shown;
}

/*
 * Where a station's name is set, after the map. The name is Helvetica at 1.056 of a line's width,
 * 0.25 of a line clear of the station's mark, its first line's capitals centred on the station
 * when it sits beside it. A long name of several words breaks onto two lines, as the map breaks
 * them, at the space that leaves the two lines most even. Each name is tried on the four sides of
 * its station, right, left, below and above, and set on the side that covers the least: of lines,
 * of other stations, and of names already set. A name beside a station on a line that runs across
 * it would lie on the line, so names on a horizontal line go below or above it and names on a
 * vertical one go right or left of it, without a rule saying so.
 */

export type LabelSide = 'right' | 'left' | 'below' | 'above';

/**
 * A name as it is set: its side, its lines, and its anchor from the station's point. Right of the
 * station the anchor is the name's top left; left of it, its top right; below, its top middle;
 * above, its bottom middle.
 */
export interface LabelPlace {
  side: LabelSide;
  lines: string[];
  dx: number;
  dy: number;
}

/** A station to name: its point, the extent of its mark about that point, and its name as set. */
export interface LabelItem {
  id: string;
  x: number;
  y: number;
  mark: { left: number; top: number; right: number; bottom: number };
  text: string;
  /** A goal's name, set in bold capitals with a little tracking. */
  bold: boolean;
}

/** A station's mark, to keep names off: whose it is, a centre and a radius. */
export interface LabelMark {
  id: string;
  x: number;
  y: number;
  r: number;
}

/** The name's size, the gap to the mark, and the distance between baselines, in screen pixels. */
export const LABEL_PX = TRACK_WIDTH * VIGNELLI.labelSize;
export const LABEL_GAP_PX = TRACK_WIDTH * VIGNELLI.labelGap;
export const LABEL_LEAD_PX = LABEL_PX * VIGNELLI.labelLeading;
/** A name wider than this, eight lines' widths, breaks onto two lines where it can. */
const WRAP_PX = TRACK_WIDTH * 8;
/** Half a line's width with its casing: how close a name may come to a line's centre. */
const LINE_HALF_PX = TRACK_WIDTH * (0.5 + VIGNELLI.casing);

/**
 * Helvetica's advance widths, in thousandths of the size, from its font metrics. A character not
 * here is taken as a lowercase letter's width, or a capital's in bold.
 */
const REGULAR: Record<string, number> = {
  ' ': 278, a: 556, b: 556, c: 500, d: 556, e: 556, f: 278, g: 556, h: 556, i: 222, j: 222, k: 500, l: 222, m: 833,
  n: 556, o: 556, p: 556, q: 556, r: 333, s: 500, t: 278, u: 556, v: 500, w: 722, x: 500, y: 500, z: 500,
  A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 500, K: 667, L: 556, M: 833, N: 722,
  O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611, U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
  '.': 278, ',': 278, '-': 333, "'": 191, ':': 278, '(': 333, ')': 333, '&': 667, '/': 278, '!': 278, '?': 556,
};
const BOLD: Record<string, number> = {
  ' ': 278, A: 722, B: 722, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 556, K: 722, L: 611, M: 833,
  N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611, U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
  '.': 278, ',': 278, '-': 333, "'": 238, ':': 333, '(': 333, ')': 333, '&': 722, '/': 278, '!': 333, '?': 611,
};
/** The goal name's tracking, 0.04em as the stylesheet sets it, in thousandths of the size. */
const BOLD_TRACKING = 40;

/** How wide a name is set, in screen pixels: a close estimate from Helvetica's widths. */
export function textWidth(text: string, bold: boolean): number {
  let units = 0;
  // A goal's name is set in capitals, whatever it was typed in.
  for (const ch of bold ? text.toUpperCase() : text) {
    const digit = ch >= '0' && ch <= '9';
    units += digit ? 556 : ((bold ? BOLD[ch] : REGULAR[ch]) ?? (bold ? 667 : 556));
    if (bold) units += BOLD_TRACKING;
  }
  return (units / 1000) * LABEL_PX;
}

/** A name's lines: one, or two broken at the space that leaves them most even, when it is long. */
export function wrapName(text: string, bold: boolean): string[] {
  if (textWidth(text, bold) <= WRAP_PX) return [text];
  let best = [text];
  let widest = Infinity;
  for (let i = text.indexOf(' '); i > 0; i = text.indexOf(' ', i + 1)) {
    const lines = [text.slice(0, i), text.slice(i + 1)];
    const w = Math.max(...lines.map((l) => textWidth(l, bold)));
    if (w < widest) [best, widest] = [lines, w];
  }
  return best;
}

/** A small lean, in pixels of line covered, toward the map's habit of setting a name right of its station, then left. */
const LEAN: Record<LabelSide, number> = { right: 0, left: 2, below: 4, above: 6 };
const SIDES: LabelSide[] = ['right', 'left', 'below', 'above'];
/** What covering another station costs, and the least a name over another name costs, in pixels of line. */
const ON_MARK = 40;
const ON_NAME = 40;

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** The anchor and the box of a name set on one side of its station. */
function setOn(item: LabelItem, side: LabelSide, lines: string[]): { place: LabelPlace; box: Box } {
  const w = Math.max(...lines.map((l) => textWidth(l, item.bold)));
  const h = lines.length * LABEL_LEAD_PX;
  const { mark } = item;
  // Beside the station, the first line's middle is the station's: its capitals centred on it.
  const beside = -LABEL_LEAD_PX / 2;
  const at = {
    right: { dx: mark.right + LABEL_GAP_PX, dy: beside, x0: mark.right + LABEL_GAP_PX, y0: beside },
    left: { dx: mark.left - LABEL_GAP_PX, dy: beside, x0: mark.left - LABEL_GAP_PX - w, y0: beside },
    below: { dx: 0, dy: mark.bottom + LABEL_GAP_PX, x0: -w / 2, y0: mark.bottom + LABEL_GAP_PX },
    above: { dx: 0, dy: mark.top - LABEL_GAP_PX, x0: -w / 2, y0: mark.top - LABEL_GAP_PX - h },
  }[side];
  return {
    place: { side, lines, dx: at.dx, dy: at.dy },
    box: { x0: item.x + at.x0, y0: item.y + at.y0, x1: item.x + at.x0 + w, y1: item.y + at.y0 + h },
  };
}

/** How long a stretch of a line, with its width, runs under a box. */
function under(box: Box, [a, b]: [Point, Point]): number {
  const grown = {
    x: box.x0 - LINE_HALF_PX,
    y: box.y0 - LINE_HALF_PX,
    w: box.x1 - box.x0 + 2 * LINE_HALF_PX,
    h: box.y1 - box.y0 + 2 * LINE_HALF_PX,
  };
  const clipped = clipSegment(a, b, grown);
  return clipped ? Math.hypot(clipped[1].x - clipped[0].x, clipped[1].y - clipped[0].y) : 0;
}

const overlap = (a: Box, b: Box) =>
  Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));

/** Whether a station's mark reaches into a box. */
const touches = (box: Box, m: LabelMark) => {
  const nx = Math.min(Math.max(m.x, box.x0), box.x1);
  const ny = Math.min(Math.max(m.y, box.y0), box.y1);
  return Math.hypot(nx - m.x, ny - m.y) < m.r;
};

/**
 * Sets every name on the side of its station that covers least. Goals' names are set first, then
 * the rest from the top of the screen down, each keeping clear of the names before it. A
 * station's own marks are no obstacle to its name.
 */
export function placeLabels(items: LabelItem[], segments: [Point, Point][], marks: LabelMark[]): Map<string, LabelPlace> {
  const order = [...items].sort((a, b) => Number(b.bold) - Number(a.bold) || a.y - b.y || a.x - b.x);
  const set: Box[] = [];
  const out = new Map<string, LabelPlace>();
  for (const item of order) {
    const lines = wrapName(item.text, item.bold);
    let best = setOn(item, SIDES[0], lines);
    let least = Infinity;
    for (const side of SIDES) {
      const tried = setOn(item, side, lines);
      let cost = LEAN[side];
      for (const s of segments) cost += under(tried.box, s);
      for (const m of marks) if (m.id !== item.id && touches(tried.box, m)) cost += ON_MARK;
      for (const b of set) {
        const o = overlap(tried.box, b);
        if (o > 0) cost += ON_NAME + o;
      }
      if (cost < least) [best, least] = [tried, cost];
    }
    set.push(best.box);
    out.set(item.id, best.place);
  }
  return out;
}

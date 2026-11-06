import type { Point } from './geometry';

/** A line ready to stroke, in screen pixels: its points, and which point each station is. */
export interface Drawn {
  points: Point[];
  stationAt: number[];
}

/**
 * A line moved into its lanes. At each point it also keeps how far it sits toward the inside of the
 * turn it makes there, and half the width of the ribbon it turns with, both in pixels.
 */
export interface Shifted extends Drawn {
  inside: number[];
  half: number[];
}

const add = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y });
const times = (a: Point, k: number): Point => ({ x: a.x * k, y: a.y * k });
const cross = (a: Point, b: Point) => a.x * b.y - a.y * b.x;
const dot = (a: Point, b: Point) => a.x * b.x + a.y * b.y;
const length = (a: Point) => Math.hypot(a.x, a.y);
const perp = (a: Point): Point => ({ x: -a.y, y: a.x });

/** A miter longer than this many lanes is cut off: the corner is drawn as its two ends. */
const MITER_LIMIT = 4;

/**
 * Moves each segment of a line sideways by its own shift, in pixels, and joins the pieces. Where
 * the line turns, the two moved segments meet at their crossing, so a ribbon turns as one. Where
 * a straight road changes lane, because a line joined or left it, the line steps across at 45
 * degrees, centred on the change. A station is the point its vertex became, the middle of a step.
 */
export function shiftLine(vertices: Point[], stationAt: number[], shift: Point[], half: number[] = []): Shifted {
  const dirs = vertices.slice(1).map((b, k) => {
    const d = { x: b.x - vertices[k].x, y: b.y - vertices[k].y };
    const l = length(d);
    return l === 0 ? null : { d: times(d, 1 / l), l };
  });
  const before = (j: number) => {
    for (let k = j - 1; k >= 0; k--) if (dirs[k]) return k;
    return -1;
  };
  const after = (j: number) => {
    for (let k = j; k < dirs.length; k++) if (dirs[k]) return k;
    return -1;
  };

  const points: Point[] = [];
  const at: number[] = [];
  const inside: number[] = [];
  const halves: number[] = [];
  const put = (...ps: Point[]) => ps.forEach((p) => (points.push(p), inside.push(0), halves.push(0)));
  vertices.forEach((v, j) => {
    const p = before(j);
    const q = after(j);
    if (p === -1 || q === -1) {
      const k = p === -1 ? q : p;
      at.push(points.length);
      put(k === -1 ? v : add(v, shift[k]));
      return;
    }
    const u1 = dirs[p]!.d;
    const u2 = dirs[q]!.d;
    const o1 = shift[p];
    const o2 = shift[q];
    const turn = cross(u1, u2);
    if (Math.abs(turn) < 1e-9) {
      const step = length({ x: o2.x - o1.x, y: o2.y - o1.y });
      if (dot(u1, u2) > 0 && step > 1e-9) {
        const h = Math.min(step / 2, dirs[p]!.l / 2, dirs[q]!.l / 2);
        put(add(add(v, times(u1, -h)), o1));
        at.push(points.length);
        put(add(v, times(add(o1, o2), 0.5)), add(add(v, times(u2, h)), o2));
      } else {
        at.push(points.length);
        put(add(v, o1));
        if (step > 1e-9) put(add(v, o2));
      }
      return;
    }
    // Where the line along u1, moved by o1, meets the line along u2, moved by o2.
    const t = cross({ x: o2.x - o1.x, y: o2.y - o1.y }, u2) / turn;
    const widest = Math.max(length(o1), length(o2));
    at.push(points.length);
    if (Math.abs(t) > MITER_LIMIT * Math.max(widest, 1)) {
      put(add(v, o1), add(v, o2));
    } else {
      put(add(add(v, o1), times(u1, t)));
      // How far this lane is toward the inside of the turn, across each of its two segments.
      const toward = Math.sign(turn);
      inside[inside.length - 1] = (dot(o1, times(perp(u1), toward)) + dot(o2, times(perp(u2), toward))) / 2;
      halves[halves.length - 1] = Math.max(half[p] ?? 0, half[q] ?? 0);
    }
  });
  return { points, stationAt: stationAt.map((j) => at[j]), inside, half: halves };
}

/** The bend is drawn in steps of at most this angle, 7.5 degrees, too fine to see. */
const STEP = Math.PI / 24;

/**
 * Rounds every bend of a line the way the map does. The innermost line of a turn leaves the
 * straight `cut` pixels before the corner and comes back onto the next straight as far after it,
 * so a sharp turn is a tight curve and a gentle one a wide sweep: the radius is the cut over the
 * tangent of half the turn. Every line further out turns about the same centre, wider by as much
 * as it is further out, so a ribbon turns as concentric arcs. An arc never takes more than half of
 * either segment beside it. A line that changes direction at a station does it under the station's
 * disc, as the map's do, so the corner stays and the line runs through the station's own point.
 */
export function roundLine(line: Shifted, cut: number): Drawn {
  const { points } = line;
  const stations = new Set(line.stationAt);
  const out: Point[] = [];
  const at: number[] = [];
  points.forEach((v, j) => {
    at.push(out.length);
    if (j === 0 || j === points.length - 1) return void out.push(v);
    const a = points[j - 1];
    const b = points[j + 1];
    const l1 = length({ x: v.x - a.x, y: v.y - a.y });
    const l2 = length({ x: b.x - v.x, y: b.y - v.y });
    if (l1 === 0 || l2 === 0) return void out.push(v);
    const u1 = times({ x: v.x - a.x, y: v.y - a.y }, 1 / l1);
    const u2 = times({ x: b.x - v.x, y: b.y - v.y }, 1 / l2);
    const turn = Math.atan2(Math.abs(cross(u1, u2)), dot(u1, u2));
    if (turn < 1e-3 || turn > Math.PI - 1e-3) return void out.push(v);
    let r = cut / Math.tan(turn / 2) + line.half[j] - line.inside[j];
    if (stations.has(j) || r < 0.5) return void out.push(v);
    let t = r * Math.tan(turn / 2);
    const room = Math.min(l1, l2) / 2;
    if (t > room) {
      t = room;
      r = t / Math.tan(turn / 2);
    }
    const toward = Math.sign(cross(u1, u2));
    const start = add(v, times(u1, -t));
    const centre = add(start, times(perp(u1), toward * r));
    const from = Math.atan2(start.y - centre.y, start.x - centre.x);
    const steps = Math.max(2, Math.ceil(turn / STEP));
    for (let k = 0; k <= steps; k++) {
      const angle = from + (toward * turn * k) / steps;
      out.push({ x: centre.x + r * Math.cos(angle), y: centre.y + r * Math.sin(angle) });
    }
  });
  return { points: out, stationAt: line.stationAt.map((j) => at[j]) };
}

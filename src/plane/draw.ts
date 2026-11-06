import type { Point } from './geometry';

/** A line ready to stroke, in screen pixels: its points, and which point each station is. */
export interface Drawn {
  points: Point[];
  stationAt: number[];
}

const add = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y });
const times = (a: Point, k: number): Point => ({ x: a.x * k, y: a.y * k });
const cross = (a: Point, b: Point) => a.x * b.y - a.y * b.x;
const dot = (a: Point, b: Point) => a.x * b.x + a.y * b.y;
const length = (a: Point) => Math.hypot(a.x, a.y);

/** A miter longer than this many lanes is cut off: the corner is drawn as its two ends. */
const MITER_LIMIT = 4;

/**
 * Moves each segment of a line sideways by its own shift, in pixels, and joins the pieces. Where
 * the line turns, the two moved segments meet at their crossing, so a ribbon turns as one. Where
 * a straight road changes lane, because a line joined or left it, the line steps across at 45
 * degrees, centred on the change. A station is the point its vertex became, the middle of a step.
 */
export function shiftLine(vertices: Point[], stationAt: number[], shift: Point[]): Drawn {
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
  vertices.forEach((v, j) => {
    const p = before(j);
    const q = after(j);
    if (p === -1 || q === -1) {
      const k = p === -1 ? q : p;
      at.push(points.length);
      points.push(k === -1 ? v : add(v, shift[k]));
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
        points.push(add(add(v, times(u1, -h)), o1));
        at.push(points.length);
        points.push(add(v, times(add(o1, o2), 0.5)));
        points.push(add(add(v, times(u2, h)), o2));
      } else {
        at.push(points.length);
        points.push(add(v, o1));
        if (step > 1e-9) points.push(add(v, o2));
      }
      return;
    }
    // Where the line along u1, moved by o1, meets the line along u2, moved by o2.
    const t = cross({ x: o2.x - o1.x, y: o2.y - o1.y }, u2) / turn;
    const widest = Math.max(length(o1), length(o2));
    at.push(points.length);
    if (Math.abs(t) > MITER_LIMIT * Math.max(widest, 1)) {
      points.push(add(v, o1), add(v, o2));
    } else {
      points.push(add(add(v, o1), times(u1, t)));
    }
  });
  return { points, stationAt: stationAt.map((j) => at[j]) };
}

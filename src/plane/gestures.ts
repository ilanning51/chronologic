import { distance, type Point } from './geometry';

/** The tray's tiles, each also a brush. */
export type Tile = 'circle' | 'triangle' | 'line' | 'sun';

/** What a pointer went down on. Read from the DOM by the plane, never by this module. */
export type Target =
  | { kind: 'paper' }
  | { kind: 'stop'; id: string; track: string; goal: boolean }
  | { kind: 'train'; track: string }
  | { kind: 'bubble'; track: string }
  | { kind: 'tile'; tile: Tile }
  | { kind: 'hold'; id: string }
  | { kind: 'hud' }
  | { kind: 'origin'; track: string } // the start of a line
  | { kind: 'marquee' } // empty paper with the select key held: a box is drawn, not a pan
  | { kind: 'selection' } // the drawn box: dragging it moves what it holds
  | { kind: 'brush' }; // empty paper while a brush is on: a drag draws, not pans

/**
 * The targets a moving pointer drags. A tap on any of them is still a tap. A train drags so the
 * app can hand a press on a train sitting at its line's start to the start; the app drops the rest.
 */
const DRAGS = new Set<Target['kind']>(['stop', 'tile', 'origin', 'marquee', 'selection', 'train', 'brush']);

/** One pointer event, in screen pixels and milliseconds. */
export interface Sample {
  id: number;
  x: number;
  y: number;
  t: number;
}

export type Gesture =
  | { type: 'pan'; dx: number; dy: number }
  | { type: 'pinch'; center: Point; factor: number; dx: number; dy: number }
  | { type: 'tap'; target: Target; at: Point }
  | { type: 'longPress'; target: Target; at: Point }
  | { type: 'dragStart'; target: Target; at: Point }
  | { type: 'dragMove'; target: Target; at: Point }
  /** cancelled: a brush stroke a second finger or the browser took over; nothing is drawn. */
  | { type: 'dragEnd'; target: Target; at: Point; cancelled?: true }
  | { type: 'holdStart'; target: Target }
  | { type: 'holdEnd'; target: Target; completed: boolean };

/** A move of more than this many pixels is never a tap. */
export const TAP_SLOP = 10;
export const LONG_PRESS_MS = 500;
export const HOLD_MS = 600;

type Mode =
  | 'pending' // down, not yet moved past the slop
  | 'pan' // paper, moving
  | 'drag' // stop or tile, moving
  | 'hold' // hold target, waiting for HOLD_MS
  | 'held' // hold target, hold completed
  | 'pressed' // stop or bubble, long press fired
  | 'pinch' // one of two pointers
  | 'dead'; // nothing more will come of this pointer

interface Tracked {
  id: number;
  target: Target;
  start: Point;
  startT: number;
  last: Point;
  /** Where the last pan was measured from, so the first pan carries the whole move. */
  anchor: Point;
  mode: Mode;
}

/**
 * Turns raw pointer samples into the app's touch grammar. It is pure state in, gestures
 * out: it never touches the DOM, which is how it is tested without a browser.
 */
export class Recognizer {
  private readonly pointers = new Map<number, Tracked>();
  private pinchPrev: { dist: number; center: Point } | null = null;

  constructor(private readonly emit: (gesture: Gesture) => void) {}

  down(s: Sample, target: Target): void {
    if (this.pointers.size >= 2) return; // three fingers are reserved for depth
    const p = { x: s.x, y: s.y };
    const tracked: Tracked = { id: s.id, target, start: p, startT: s.t, last: p, anchor: p, mode: 'pending' };

    if (this.pointers.size === 1) {
      const [first] = this.pointers.values();
      this.endSingle(first);
      first.mode = 'pinch';
      tracked.mode = 'pinch';
      this.pointers.set(s.id, tracked);
      this.pinchPrev = this.pinchState();
      return;
    }

    if (target.kind === 'hold') {
      tracked.mode = 'hold';
      this.emit({ type: 'holdStart', target });
    }
    this.pointers.set(s.id, tracked);
  }

  move(s: Sample): void {
    const t = this.pointers.get(s.id);
    if (!t) return;
    const p = { x: s.x, y: s.y };
    t.last = p;

    switch (t.mode) {
      case 'pinch': {
        if (this.pointers.size === 2 && this.pinchPrev) {
          const now = this.pinchState();
          const factor = this.pinchPrev.dist > 0 ? now.dist / this.pinchPrev.dist : 1;
          this.emit({
            type: 'pinch',
            center: now.center,
            factor,
            dx: now.center.x - this.pinchPrev.center.x,
            dy: now.center.y - this.pinchPrev.center.y,
          });
          this.pinchPrev = now;
        }
        return;
      }
      case 'pending': {
        if (distance(t.start, p) <= TAP_SLOP) return;
        if (t.target.kind === 'paper') {
          t.mode = 'pan';
          this.emit({ type: 'pan', dx: p.x - t.anchor.x, dy: p.y - t.anchor.y });
          t.anchor = p;
        } else if (DRAGS.has(t.target.kind)) {
          t.mode = 'drag';
          this.emit({ type: 'dragStart', target: t.target, at: t.start });
          this.emit({ type: 'dragMove', target: t.target, at: p });
        } else {
          t.mode = 'dead';
        }
        return;
      }
      case 'pan':
        this.emit({ type: 'pan', dx: p.x - t.anchor.x, dy: p.y - t.anchor.y });
        t.anchor = p;
        return;
      case 'drag':
        this.emit({ type: 'dragMove', target: t.target, at: p });
        return;
      case 'hold':
        if (distance(t.start, p) > TAP_SLOP) {
          t.mode = 'dead';
          this.emit({ type: 'holdEnd', target: t.target, completed: false });
        }
        return;
      default:
        return;
    }
  }

  up(s: Sample): void {
    const t = this.pointers.get(s.id);
    if (!t) return;
    this.pointers.delete(s.id);
    const p = { x: s.x, y: s.y };

    switch (t.mode) {
      case 'pinch':
        this.leavePinch();
        return;
      case 'pending':
        this.emit({ type: 'tap', target: t.target, at: t.start });
        return;
      case 'hold':
        this.emit({ type: 'tap', target: t.target, at: t.start });
        this.emit({ type: 'holdEnd', target: t.target, completed: false });
        return;
      case 'drag':
        this.emit({ type: 'dragEnd', target: t.target, at: p });
        return;
      default:
        return;
    }
  }

  /** The pointer was taken away by the browser. Nothing is left half done. */
  cancel(id: number): void {
    const t = this.pointers.get(id);
    if (!t) return;
    this.pointers.delete(id);
    if (t.mode === 'pinch') {
      this.leavePinch();
      return;
    }
    this.endSingle(t);
  }

  /** Lets time pass: long presses and completed holds fire from here. */
  tick(now: number): void {
    for (const t of this.pointers.values()) {
      if (t.mode === 'pending' && (t.target.kind === 'stop' || t.target.kind === 'bubble') && now - t.startT >= LONG_PRESS_MS) {
        t.mode = 'pressed';
        this.emit({ type: 'longPress', target: t.target, at: t.start });
      } else if (t.mode === 'hold' && now - t.startT >= HOLD_MS) {
        t.mode = 'held';
        this.emit({ type: 'holdEnd', target: t.target, completed: true });
      }
    }
  }

  /** Closes whatever a lone pointer was doing, as a second finger or a cancel took it over. */
  private endSingle(t: Tracked): void {
    if (t.mode === 'drag') {
      // A stroke cut short draws nothing; any other drag ends where it got to.
      this.emit(
        t.target.kind === 'brush'
          ? { type: 'dragEnd', target: t.target, at: t.last, cancelled: true }
          : { type: 'dragEnd', target: t.target, at: t.last },
      );
    }
    if (t.mode === 'hold') this.emit({ type: 'holdEnd', target: t.target, completed: false });
  }

  /** One of two fingers is gone: the other carries on as a pan from where it is. */
  private leavePinch(): void {
    this.pinchPrev = null;
    const [rest] = this.pointers.values();
    if (rest) {
      rest.mode = 'pan';
      rest.anchor = rest.last;
    }
  }

  private pinchState(): { dist: number; center: Point } {
    const [a, b] = this.pointers.values();
    return {
      dist: distance(a.last, b.last),
      center: { x: (a.last.x + b.last.x) / 2, y: (a.last.y + b.last.y) / 2 },
    };
  }
}

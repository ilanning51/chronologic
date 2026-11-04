import { expect, test, vi } from 'vitest';
import { type Gesture, HOLD_MS, LONG_PRESS_MS, Recognizer, TAP_SLOP, type Target } from './gestures';

function rig() {
  const emit = vi.fn<(g: Gesture) => void>();
  const r = new Recognizer(emit);
  return {
    r,
    emit,
    gestures: () => emit.mock.calls.map((c) => c[0]),
    types: () => emit.mock.calls.map((c) => c[0].type),
  };
}

const paper: Target = { kind: 'paper' };
const stopA: Target = { kind: 'stop', id: 'a', track: 't', goal: false };
const tileCircle: Target = { kind: 'tile', tile: 'circle' };
const holdDelete: Target = { kind: 'hold', id: 'delete' };
const bubble: Target = { kind: 'bubble', track: 't' };
const train: Target = { kind: 'train', track: 't' };
const hud: Target = { kind: 'hud' };

test('the thresholds are the spec values', () => {
  expect(TAP_SLOP).toBe(10);
  expect(LONG_PRESS_MS).toBe(500);
  expect(HOLD_MS).toBe(600);
});

test('a short press on paper is a tap, a longer move is a pan', () => {
  const { r, emit, gestures } = rig();
  r.down({ id: 1, x: 0, y: 0, t: 0 }, paper);
  r.up({ id: 1, x: 3, y: 3, t: 100 });
  expect(gestures()).toEqual([{ type: 'tap', target: paper, at: { x: 0, y: 0 } }]);

  emit.mockClear();
  r.down({ id: 1, x: 0, y: 0, t: 200 }, paper);
  r.move({ id: 1, x: 5, y: 0, t: 210 });
  expect(emit).not.toHaveBeenCalled();
  r.move({ id: 1, x: 20, y: 0, t: 220 });
  r.move({ id: 1, x: 25, y: 5, t: 240 });
  r.up({ id: 1, x: 25, y: 5, t: 260 });
  expect(gestures()).toEqual([
    { type: 'pan', dx: 20, dy: 0 },
    { type: 'pan', dx: 5, dy: 5 },
  ]);
});

test('a stop becomes a drag only past the slop', () => {
  const { r, emit, gestures } = rig();
  r.down({ id: 1, x: 100, y: 100, t: 0 }, stopA);
  r.move({ id: 1, x: 109, y: 100, t: 10 });
  expect(emit).not.toHaveBeenCalled();
  r.move({ id: 1, x: 111, y: 100, t: 20 });
  r.up({ id: 1, x: 120, y: 100, t: 30 });
  expect(gestures()).toEqual([
    { type: 'dragStart', target: stopA, at: { x: 100, y: 100 } },
    { type: 'dragMove', target: stopA, at: { x: 111, y: 100 } },
    { type: 'dragEnd', target: stopA, at: { x: 120, y: 100 } },
  ]);
});

test('a quick release on a stop is a tap', () => {
  const { r, gestures } = rig();
  r.down({ id: 1, x: 5, y: 5, t: 0 }, stopA);
  r.move({ id: 1, x: 7, y: 5, t: 50 });
  r.up({ id: 1, x: 7, y: 5, t: 150 });
  expect(gestures()).toEqual([{ type: 'tap', target: stopA, at: { x: 5, y: 5 } }]);
});

test('holding a stop fires a long press and swallows the tap', () => {
  const { r, emit, gestures } = rig();
  r.down({ id: 1, x: 5, y: 5, t: 0 }, stopA);
  r.tick(499);
  expect(emit).not.toHaveBeenCalled();
  r.tick(500);
  expect(gestures()).toEqual([{ type: 'longPress', target: stopA, at: { x: 5, y: 5 } }]);
  r.tick(700);
  r.up({ id: 1, x: 5, y: 5, t: 800 });
  expect(gestures()).toHaveLength(1);
});

test('a long press does not fire once the pointer has moved, and a tile never long presses', () => {
  const { r, types, emit } = rig();
  r.down({ id: 1, x: 0, y: 0, t: 0 }, stopA);
  r.move({ id: 1, x: 20, y: 0, t: 10 });
  r.tick(600);
  expect(types()).toEqual(['dragStart', 'dragMove']);
  r.up({ id: 1, x: 20, y: 0, t: 620 });

  emit.mockClear();
  r.down({ id: 2, x: 0, y: 0, t: 1000 }, tileCircle);
  r.tick(1600);
  expect(emit).not.toHaveBeenCalled();
  r.up({ id: 2, x: 0, y: 0, t: 1700 });
  expect(types()).toEqual(['tap']);
});

test('the hold target taps on a quick release and completes on a hold', () => {
  const { r, emit, gestures, types } = rig();
  r.down({ id: 1, x: 0, y: 0, t: 0 }, holdDelete);
  expect(gestures()).toEqual([{ type: 'holdStart', target: holdDelete }]);
  r.up({ id: 1, x: 0, y: 0, t: 200 });
  expect(gestures().slice(1)).toEqual([
    { type: 'tap', target: holdDelete, at: { x: 0, y: 0 } },
    { type: 'holdEnd', target: holdDelete, completed: false },
  ]);

  emit.mockClear();
  r.down({ id: 1, x: 0, y: 0, t: 1000 }, holdDelete);
  r.tick(1599);
  expect(types()).toEqual(['holdStart']);
  r.tick(1600);
  expect(gestures()[1]).toEqual({ type: 'holdEnd', target: holdDelete, completed: true });
  r.tick(1700);
  r.up({ id: 1, x: 0, y: 0, t: 1800 });
  expect(types()).toEqual(['holdStart', 'holdEnd']);
});

test('sliding off the hold target cancels the hold', () => {
  const { r, gestures } = rig();
  r.down({ id: 1, x: 0, y: 0, t: 0 }, holdDelete);
  r.move({ id: 1, x: 30, y: 0, t: 100 });
  r.up({ id: 1, x: 30, y: 0, t: 200 });
  expect(gestures()).toEqual([
    { type: 'holdStart', target: holdDelete },
    { type: 'holdEnd', target: holdDelete, completed: false },
  ]);
});

test('two pointers pinch about their midpoint and never pan', () => {
  const { r, gestures } = rig();
  r.down({ id: 1, x: 0, y: 0, t: 0 }, paper);
  r.down({ id: 2, x: 100, y: 0, t: 10 }, paper);
  r.move({ id: 2, x: 200, y: 0, t: 20 });
  expect(gestures()).toEqual([{ type: 'pinch', center: { x: 100, y: 0 }, factor: 2, dx: 50, dy: 0 }]);
  r.move({ id: 1, x: 100, y: 0, t: 30 });
  expect(gestures()[1]).toEqual({ type: 'pinch', center: { x: 150, y: 0 }, factor: 0.5, dx: 50, dy: 0 });
});

test('losing one of two fingers continues as a pan with no jump', () => {
  const { r, emit, gestures, types } = rig();
  r.down({ id: 1, x: 0, y: 0, t: 0 }, paper);
  r.down({ id: 2, x: 100, y: 0, t: 10 }, paper);
  r.move({ id: 2, x: 200, y: 0, t: 20 });
  r.up({ id: 1, x: 0, y: 0, t: 30 });
  emit.mockClear();
  r.move({ id: 2, x: 210, y: 10, t: 40 });
  expect(gestures()).toEqual([{ type: 'pan', dx: 10, dy: 10 }]);
  r.up({ id: 2, x: 210, y: 10, t: 50 });
  expect(types()).toEqual(['pan']);
});

test('a second finger on a pending tap makes it a pinch, not a tap', () => {
  const { r, types } = rig();
  r.down({ id: 1, x: 0, y: 0, t: 0 }, stopA);
  r.down({ id: 2, x: 100, y: 0, t: 10 }, paper);
  r.up({ id: 2, x: 100, y: 0, t: 20 });
  r.up({ id: 1, x: 0, y: 0, t: 30 });
  expect(types()).toEqual([]);
});

test('a third pointer is ignored', () => {
  const { r, emit, types } = rig();
  r.down({ id: 1, x: 0, y: 0, t: 0 }, paper);
  r.down({ id: 2, x: 100, y: 0, t: 10 }, paper);
  r.down({ id: 3, x: 50, y: 50, t: 20 }, paper);
  r.move({ id: 3, x: 80, y: 80, t: 30 });
  r.up({ id: 3, x: 80, y: 80, t: 40 });
  expect(emit).not.toHaveBeenCalled();
  r.move({ id: 2, x: 200, y: 0, t: 50 });
  expect(types()).toEqual(['pinch']);
});

test('a drag from a tile is reported with the bullet as its target', () => {
  const { r, gestures } = rig();
  r.down({ id: 1, x: 40, y: 300, t: 0 }, tileCircle);
  r.move({ id: 1, x: 80, y: 280, t: 10 });
  r.up({ id: 1, x: 90, y: 270, t: 20 });
  expect(gestures()).toEqual([
    { type: 'dragStart', target: tileCircle, at: { x: 40, y: 300 } },
    { type: 'dragMove', target: tileCircle, at: { x: 80, y: 280 } },
    { type: 'dragEnd', target: tileCircle, at: { x: 90, y: 270 } },
  ]);
});

test('cancel ends a drag at its last position and a hold without completing', () => {
  const { r, emit, gestures } = rig();
  r.down({ id: 1, x: 0, y: 0, t: 0 }, stopA);
  r.move({ id: 1, x: 20, y: 0, t: 10 });
  r.cancel(1);
  expect(gestures()[2]).toEqual({ type: 'dragEnd', target: stopA, at: { x: 20, y: 0 } });
  r.up({ id: 1, x: 20, y: 0, t: 20 });
  expect(gestures()).toHaveLength(3);

  emit.mockClear();
  r.down({ id: 2, x: 0, y: 0, t: 100 }, holdDelete);
  r.cancel(2);
  expect(gestures()).toEqual([
    { type: 'holdStart', target: holdDelete },
    { type: 'holdEnd', target: holdDelete, completed: false },
  ]);
});

test('a tap on the hud is reported and a drag on it does nothing', () => {
  const { r, emit, gestures } = rig();
  r.down({ id: 1, x: 0, y: 0, t: 0 }, hud);
  r.up({ id: 1, x: 0, y: 0, t: 50 });
  expect(gestures()).toEqual([{ type: 'tap', target: hud, at: { x: 0, y: 0 } }]);
  emit.mockClear();
  r.down({ id: 1, x: 0, y: 0, t: 100 }, hud);
  r.move({ id: 1, x: 50, y: 50, t: 110 });
  r.up({ id: 1, x: 50, y: 50, t: 120 });
  expect(emit).not.toHaveBeenCalled();
});

test('holding a bubble fires a long press with the bubble as its target', () => {
  const { r, gestures } = rig();
  r.down({ id: 1, x: 5, y: 5, t: 0 }, bubble);
  r.tick(500);
  expect(gestures()).toEqual([{ type: 'longPress', target: bubble, at: { x: 5, y: 5 } }]);
});

test('a drag starting on a bubble emits nothing', () => {
  const { r, emit } = rig();
  r.down({ id: 1, x: 0, y: 0, t: 0 }, bubble);
  r.move({ id: 1, x: 50, y: 50, t: 10 });
  r.up({ id: 1, x: 50, y: 50, t: 20 });
  expect(emit).not.toHaveBeenCalled();
});

test('a drag starting on a train is a drag, for the app to read as the start of its line', () => {
  const { r, types } = rig();
  r.down({ id: 1, x: 0, y: 0, t: 0 }, train);
  r.move({ id: 1, x: 50, y: 50, t: 10 });
  r.up({ id: 1, x: 50, y: 50, t: 20 });
  expect(types()).toEqual(['dragStart', 'dragMove', 'dragEnd']);
});

const origin: Target = { kind: 'origin', track: 't' };
const marquee: Target = { kind: 'marquee' };
const selection: Target = { kind: 'selection' };
const split: Target = { kind: 'split', id: 'a', track: 't' };

test.each([origin, marquee, selection, split])('%o drags like a stop and never long presses', (target) => {
  const { r, gestures } = rig();
  r.down({ id: 1, x: 0, y: 0, t: 0 }, target);
  r.tick(LONG_PRESS_MS + 1);
  r.move({ id: 1, x: 20, y: 0, t: 600 });
  r.up({ id: 1, x: 30, y: 0, t: 700 });
  expect(gestures()).toEqual([
    { type: 'dragStart', target, at: { x: 0, y: 0 } },
    { type: 'dragMove', target, at: { x: 20, y: 0 } },
    { type: 'dragEnd', target, at: { x: 30, y: 0 } },
  ]);
});

test('a short press on the marquee or the selection is a tap', () => {
  const { r, gestures } = rig();
  r.down({ id: 1, x: 0, y: 0, t: 0 }, selection);
  r.up({ id: 1, x: 2, y: 0, t: 100 });
  expect(gestures()).toEqual([{ type: 'tap', target: selection, at: { x: 0, y: 0 } }]);
});

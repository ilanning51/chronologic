import { expect, test } from 'vitest';
import { cutAt, legEndAt, legSpan, nearestOnRoute, pathLength, routeThrough } from './routing';

test('routes a diagonal then a straight run, first vertex is the first point', () => {
  const r = routeThrough([{ x: 0, y: 0 }, { x: 100, y: 30 }]);
  expect(r.vertices).toEqual([{ x: 0, y: 0 }, { x: 30, y: 30 }, { x: 100, y: 30 }]);
  expect(r.stationAt).toEqual([0, 2]);
});
test('pathLength sums the segments and legSpan names a leg', () => {
  const r = routeThrough([{ x: 0, y: 0 }, { x: 100, y: 30 }, { x: 100, y: 130 }]);
  expect(pathLength(r.vertices, 0, 2)).toBeCloseTo(30 * Math.SQRT2 + 70);
  expect(legSpan(r, 1)).toEqual({ from: 2, to: 3 });
});
test('nearestOnRoute finds the leg, the offset along it and the foot point', () => {
  const r = routeThrough([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 200, y: 0 }]);
  expect(nearestOnRoute(r, { x: 150, y: 8 })).toEqual({ leg: 1, offset: 50, at: { x: 150, y: 0 }, dist: 8 });
});
test('cutAt splits the route at the train, repeating no vertex', () => {
  const r = routeThrough([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 200, y: 0 }]);
  // Mid-leg: the cut point ends behind and starts ahead.
  expect(cutAt(r.vertices, 0, 1, 40)).toEqual({
    behind: [{ x: 0, y: 0 }, { x: 40, y: 0 }],
    ahead: [{ x: 40, y: 0 }, { x: 100, y: 0 }, { x: 200, y: 0 }],
  });
  // Waiting at the stop: the stop ends behind and starts ahead, once each.
  expect(cutAt(r.vertices, 0, 1, 100)).toEqual({
    behind: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
    ahead: [{ x: 100, y: 0 }, { x: 200, y: 0 }],
  });
  // Just departed on the second leg: nothing of it is behind yet.
  expect(cutAt(r.vertices, 1, 2, 0)).toEqual({
    behind: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
    ahead: [{ x: 100, y: 0 }, { x: 200, y: 0 }],
  });
});
test('a bend can sit at either end of its leg, and the leg is as long either way', () => {
  const first = routeThrough([{ x: 0, y: 0 }, { x: 100, y: 30 }], ['diagonal-first']);
  const last = routeThrough([{ x: 0, y: 0 }, { x: 100, y: 30 }], ['straight-first']);
  expect(last.vertices).toEqual([{ x: 0, y: 0 }, { x: 70, y: 0 }, { x: 100, y: 30 }]);
  expect(pathLength(last.vertices, 0, 2)).toBeCloseTo(pathLength(first.vertices, 0, 2));
});

test('legEndAt finds the end of a leg of a given length at a given height, either side', () => {
  const from = { x: 100, y: 50 };
  const lengthTo = (to: { x: number; y: number }) => {
    const r = routeThrough([from, to]);
    return pathLength(r.vertices, 0, r.vertices.length - 1);
  };
  // Mostly across, mostly up or down, level, and on the left: every one is the same length.
  for (const [y, side] of [[80, 1], [50, 1], [-200, 1], [400, -1], [-250, -1]] as const) {
    const end = legEndAt(from, 1000, y, side);
    expect(end.y).toBe(y);
    expect(Math.sign(end.x - from.x)).toBe(side);
    expect(lengthTo(end)).toBeCloseTo(1000, 9);
  }
  expect(legEndAt(from, 1000, 50, 1)).toEqual({ x: 1100, y: 50 });
  // Further up than the leg is long: straight above, the whole length.
  expect(legEndAt(from, 1000, -2000, 1)).toEqual({ x: 100, y: -950 });
  expect(legEndAt(from, 1000, 3000, -1)).toEqual({ x: 100, y: 1050 });
});

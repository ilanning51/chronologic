import { expect, test } from 'vitest';
import { legSpan, nearestOnRoute, pathLength, routeThrough } from './routing';

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

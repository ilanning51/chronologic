import { expect, test } from 'vitest';
import { LEAD, pointAlong, routeThrough, TERMINUS_OVERRUN, terminusOf, trainOn } from './routing';

test('the constants are the spec values', () => {
  expect(LEAD).toBe(40);
  expect(TERMINUS_OVERRUN).toBe(32);
});

test('routes with a diagonal first then a straight run', () => {
  const r = routeThrough([
    { x: 0, y: 0 },
    { x: 100, y: 60 },
  ]);
  expect(r.vertices).toEqual([
    { x: -40, y: 0 },
    { x: 0, y: 0 },
    { x: 60, y: 60 },
    { x: 100, y: 60 },
  ]);
  expect(r.stationAt).toEqual([1, 3]);
});

test('a vertical run after the diagonal, and a run back to the left', () => {
  expect(
    routeThrough([
      { x: 0, y: 0 },
      { x: 40, y: 100 },
    ]).vertices,
  ).toEqual([
    { x: -40, y: 0 },
    { x: 0, y: 0 },
    { x: 40, y: 40 },
    { x: 40, y: 100 },
  ]);
  expect(
    routeThrough([
      { x: 100, y: 0 },
      { x: 0, y: -30 },
    ]).vertices,
  ).toEqual([
    { x: 60, y: 0 },
    { x: 100, y: 0 },
    { x: 70, y: -30 },
    { x: 0, y: -30 },
  ]);
});

test('straight and exact diagonal pairs add no extra vertex', () => {
  const flat = routeThrough([
    { x: 0, y: 0 },
    { x: 100, y: 0 },
  ]);
  expect(flat.vertices).toEqual([
    { x: -40, y: 0 },
    { x: 0, y: 0 },
    { x: 100, y: 0 },
  ]);
  expect(flat.stationAt).toEqual([1, 2]);
  const diagonal = routeThrough([
    { x: 0, y: 0 },
    { x: 50, y: 50 },
  ]);
  expect(diagonal.vertices).toEqual([
    { x: -40, y: 0 },
    { x: 0, y: 0 },
    { x: 50, y: 50 },
  ]);
});

test('an empty route has nothing in it', () => {
  expect(routeThrough([])).toEqual({ vertices: [], stationAt: [] });
});

test('terminus continues the last segment', () => {
  const flat = routeThrough([
    { x: 0, y: 0 },
    { x: 100, y: 0 },
  ]);
  expect(terminusOf(flat)).toEqual({ at: { x: 132, y: 0 }, angle: 0 });

  const diagonal = routeThrough([
    { x: 0, y: 0 },
    { x: 50, y: 50 },
  ]);
  const t = terminusOf(diagonal);
  expect(t.at.x).toBeCloseTo(50 + 32 / Math.SQRT2);
  expect(t.at.y).toBeCloseTo(50 + 32 / Math.SQRT2);
  expect(t.angle).toBeCloseTo(45);
});

test('a single station has a lead to its left and a terminus to its right', () => {
  const r = routeThrough([{ x: 10, y: 20 }]);
  expect(r.vertices).toEqual([
    { x: -30, y: 20 },
    { x: 10, y: 20 },
  ]);
  expect(terminusOf(r)).toEqual({ at: { x: 42, y: 20 }, angle: 0 });
});

test('the train waits on the lead before the first station, then between stations', () => {
  const flat = routeThrough([
    { x: 0, y: 0 },
    { x: 100, y: 0 },
  ]);
  expect(trainOn(flat, 0)).toEqual({ at: { x: -20, y: 0 }, angle: 0 });
  expect(trainOn(flat, 1)).toEqual({ at: { x: 50, y: 0 }, angle: 0 });
});

test('the train sits halfway along a bent segment, on the diagonal', () => {
  const r = routeThrough([
    { x: 0, y: 0 },
    { x: 100, y: 60 },
  ]);
  const half = (60 * Math.SQRT2 + 40) / 2;
  const train = trainOn(r, 1);
  expect(train.at.x).toBeCloseTo(half / Math.SQRT2);
  expect(train.at.y).toBeCloseTo(half / Math.SQRT2);
  expect(train.angle).toBeCloseTo(45);
});

test('pointAlong reaches both ends and reports the segment angle', () => {
  const v = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
  ];
  expect(pointAlong(v, 0, 2, 0)).toEqual({ at: { x: 0, y: 0 }, angle: 0 });
  expect(pointAlong(v, 0, 2, 1)).toEqual({ at: { x: 10, y: 10 }, angle: 90 });
  expect(pointAlong(v, 0, 2, 0.75)).toEqual({ at: { x: 10, y: 5 }, angle: 90 });
});

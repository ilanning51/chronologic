import { expect, test } from 'vitest';
import { roundLine, shiftLine } from './draw';

test('a line alone is drawn where it is', () => {
  const vertices = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 150, y: 50 }];
  const zero = { x: 0, y: 0 };
  const drawn = shiftLine(vertices, [0, 2], [zero, zero]);
  expect(drawn.points).toEqual(vertices);
  expect(drawn.stationAt).toEqual([0, 2]);
});

test('a line moved off its road turns at the meeting of its moved segments', () => {
  // Right along y 0, then down along x 100, both moved 6 px to the left of the way along.
  const drawn = shiftLine([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }], [0, 2], [{ x: 0, y: -6 }, { x: 6, y: 0 }]);
  expect(drawn.points).toEqual([{ x: 0, y: -6 }, { x: 106, y: -6 }, { x: 106, y: 100 }]);
});

test('a line that changes lane on a straight road steps across at 45 degrees, the station in the middle', () => {
  const drawn = shiftLine([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 200, y: 0 }], [0, 1, 2], [{ x: 0, y: -6 }, { x: 0, y: 0 }]);
  expect(drawn.points).toEqual([{ x: 0, y: -6 }, { x: 97, y: -6 }, { x: 100, y: -3 }, { x: 103, y: 0 }, { x: 200, y: 0 }]);
  expect(drawn.stationAt).toEqual([0, 2, 4]);
});

const zero = { x: 0, y: 0 };
const distanceTo = (c: { x: number; y: number }) => (p: { x: number; y: number }) => Math.hypot(p.x - c.x, p.y - c.y);

test('a bend is a circular arc of the radius, touching both runs', () => {
  // Right along y 0 to (100, 0), then down. The arc's centre is (68, 32) for a 32 px radius.
  const { points } = roundLine(shiftLine([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }], [0, 2], [zero, zero]), 32);
  const arc = points.slice(1, -1);
  expect(arc[0]).toEqual({ x: 68, y: 0 });
  expect(arc[arc.length - 1].x).toBeCloseTo(100);
  expect(arc[arc.length - 1].y).toBeCloseTo(32);
  for (const r of arc.map(distanceTo({ x: 68, y: 32 }))) expect(r).toBeCloseTo(32);
});

test('two lanes turn about one centre, the inside one tighter by its lane', () => {
  const road = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }];
  const turnOf = (lane: number) => {
    // Across y 0 is +y; across x 100, going down, is -x. Positive lanes are on the inside of this right turn.
    const shifted = shiftLine(road, [0, 2], [{ x: 0, y: 6 * lane }, { x: -6 * lane, y: 0 }]);
    return roundLine(shifted, 32).points.slice(1, -1);
  };
  for (const r of turnOf(1).map(distanceTo({ x: 68, y: 32 }))) expect(r).toBeCloseTo(26);
  for (const r of turnOf(-1).map(distanceTo({ x: 68, y: 32 }))) expect(r).toBeCloseTo(38);
});

test('a bend made at a station stays a corner, so the line runs through the station', () => {
  const vertices = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }];
  expect(roundLine(shiftLine(vertices, [0, 1, 2], [zero, zero]), 32).points).toEqual(vertices);
});

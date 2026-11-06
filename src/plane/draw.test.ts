import { expect, test } from 'vitest';
import { shiftLine } from './draw';

test('a line alone is drawn where it is', () => {
  const vertices = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 150, y: 50 }];
  const zero = { x: 0, y: 0 };
  expect(shiftLine(vertices, [0, 2], [zero, zero])).toEqual({ points: vertices, stationAt: [0, 2] });
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

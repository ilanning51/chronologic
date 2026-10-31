import { expect, test } from 'vitest';
import { clipSegment } from './clip';

const rect = { x: -200, y: -200, w: 1400, h: 1200 };

test('a segment a billion pixels long is clipped to the margin and keeps its slope', () => {
  const s = clipSegment({ x: -1e9, y: 10 }, { x: 1e9, y: 10 }, rect);
  expect(s).toEqual([{ x: -200, y: 10 }, { x: 1200, y: 10 }]);
});

test('a diagonal keeps its slope when clipped', () => {
  const s = clipSegment({ x: -1000, y: -1000 }, { x: 1000, y: 1000 }, rect)!;
  expect(s[0]).toEqual({ x: -200, y: -200 });
  expect(s[1]).toEqual({ x: 1000, y: 1000 });
});

test('a segment entirely outside is dropped', () => {
  expect(clipSegment({ x: 5e8, y: 0 }, { x: 6e8, y: 0 }, rect)).toBeNull();
});

test('a segment entirely inside is unchanged', () => {
  expect(clipSegment({ x: 0, y: 0 }, { x: 10, y: 20 }, rect)).toEqual([{ x: 0, y: 0 }, { x: 10, y: 20 }]);
});

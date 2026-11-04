import { expect, test } from 'vitest';
import { BUBBLE_INSET_PX, bubbleFor, clearOf } from './bubbles';

const viewport = { w: 1000, h: 800 };

test('a target inside the viewport needs no bubble', () => {
  expect(bubbleFor({ x: 10, y: 790 }, viewport)).toBeNull();
  expect(bubbleFor({ x: 500, y: 400 }, viewport)).toBeNull();
});

test('a target far right at the centre row lands on the right inset edge', () => {
  expect(bubbleFor({ x: 1e6, y: 400 }, viewport)).toEqual({ x: viewport.w - BUBBLE_INSET_PX, y: viewport.h / 2, side: 'right' });
});

test('a target up and to the left lands on the top or left inset edge, inside the inset rectangle', () => {
  const at = bubbleFor({ x: -5000, y: -3000 }, viewport)!;
  expect(at.x).toBeGreaterThanOrEqual(BUBBLE_INSET_PX);
  expect(at.x).toBeLessThanOrEqual(viewport.w - BUBBLE_INSET_PX);
  expect(at.y).toBeGreaterThanOrEqual(BUBBLE_INSET_PX);
  expect(at.y).toBeLessThanOrEqual(viewport.h - BUBBLE_INSET_PX);
  // The ray is flatter than the window's diagonal, so it reaches the left edge first.
  expect(at.side).toBe('left');
  expect(at.x).toBe(BUBBLE_INSET_PX);
});

test('a left-edge bubble that would sit under the corner pill moves just below it', () => {
  const corner = { w: 130, h: 70 };
  expect(clearOf({ x: 16, y: 40, side: 'left' }, corner)).toEqual({ x: 16, y: 70 + 22, side: 'left' });
  expect(clearOf({ x: 16, y: 300, side: 'left' }, corner)).toEqual({ x: 16, y: 300, side: 'left' });
});

test('a top-edge bubble near the corner pill hangs from the left edge below it instead', () => {
  const corner = { w: 130, h: 70 };
  expect(clearOf({ x: 100, y: 16, side: 'top' }, corner)).toEqual({ x: BUBBLE_INSET_PX, y: 70 + 22, side: 'left' });
  expect(clearOf({ x: 600, y: 16, side: 'top' }, corner)).toEqual({ x: 600, y: 16, side: 'top' });
  expect(clearOf({ x: 984, y: 40, side: 'right' }, corner)).toEqual({ x: 984, y: 40, side: 'right' });
});

import { expect, test } from 'vitest';
import { centerOn, cssTransform, HOME, MAX_SCALE, MIN_SCALE, panBy, screenToWorld, STRETCH_ZOOM, worldToScreen, zoomAt } from './camera';
import { distance } from './geometry';

test('distance is euclidean', () => {
  expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
});

test('screen and world round-trip', () => {
  const c = { x: 100, y: 50, scale: 2 };
  expect(worldToScreen(c, { x: 10, y: 10 })).toEqual({ x: 120, y: 70 });
  expect(screenToWorld(c, worldToScreen(c, { x: 3, y: 4 }))).toEqual({ x: 3, y: 4 });
});

test('panBy moves the camera in screen pixels', () => {
  expect(panBy({ x: 10, y: 10, scale: 2 }, 5, -5)).toEqual({ x: 15, y: 5, scale: 2 });
});

test('zoomAt keeps the point under the finger still', () => {
  const c = { x: 30, y: -20, scale: 1.25 };
  const finger = { x: 300, y: 200 };
  const before = screenToWorld(c, finger);
  const after = zoomAt(c, finger, 1.5);
  expect(screenToWorld(after, finger).x).toBeCloseTo(before.x);
  expect(screenToWorld(after, finger).y).toBeCloseTo(before.y);
  expect(after.scale).toBeCloseTo(1.875);
});

test('zoomAt clamps the scale', () => {
  expect(zoomAt(HOME, { x: 0, y: 0 }, 100).scale).toBe(MAX_SCALE);
  expect(zoomAt(HOME, { x: 0, y: 0 }, 0.001).scale).toBe(MIN_SCALE);
});

test('centerOn puts the world point in the middle of the viewport', () => {
  const c = centerOn(HOME, { x: 500, y: 300 }, { w: 800, h: 400 }, STRETCH_ZOOM);
  expect(c.scale).toBe(STRETCH_ZOOM);
  expect(worldToScreen(c, { x: 500, y: 300 })).toEqual({ x: 400, y: 200 });
});

test('cssTransform writes the camera as a translate then a scale', () => {
  expect(cssTransform({ x: 12, y: -3, scale: 1.5 })).toBe('translate(12px, -3px) scale(1.5)');
});

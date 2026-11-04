import { expect, test } from 'vitest';
import { centerOn, FIT_PAD_PX, fitLeg, fitPoints, HOME, interpolate, MAX_SCALE, MIN_SCALE, MOTION_SCALE, panBy, screenToWorld, worldToScreen, zoomAt } from './camera';
import { distance } from './geometry';

test('distance is euclidean', () => {
  expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
});

test('the zoom range is pixels per second, from a month across a screen to twenty pixels a second', () => {
  expect(MIN_SCALE).toBe(0.0002);
  expect(MAX_SCALE).toBe(20);
  expect(MOTION_SCALE).toBe(MAX_SCALE);
  expect(HOME).toEqual({ x: 0, y: 0, scale: 0.01 });
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
  expect(zoomAt(HOME, { x: 0, y: 0 }, 1e6).scale).toBe(MAX_SCALE);
  expect(zoomAt(HOME, { x: 0, y: 0 }, 1e-6).scale).toBe(MIN_SCALE);
});

test('centerOn puts the world point in the middle of the viewport', () => {
  const c = centerOn(HOME, { x: 500, y: 300 }, { w: 800, h: 400 }, 0.5);
  expect(c.scale).toBe(0.5);
  expect(worldToScreen(c, { x: 500, y: 300 })).toEqual({ x: 400, y: 200 });
});

test('fitLeg shows a leg as a third of the width, clamped to the zoom range', () => {
  expect(fitLeg(3000, 900)).toBeCloseTo(0.1);
  expect(fitLeg(3000, 900, 1)).toBeCloseTo(0.3);
  expect(fitLeg(1e9, 900)).toBe(MIN_SCALE);
  expect(fitLeg(0.001, 900)).toBe(MAX_SCALE);
  expect(fitLeg(0, 900)).toBe(MAX_SCALE);
});

test('interpolate is linear in position and geometric in scale', () => {
  const a = { x: 0, y: 100, scale: 0.01 };
  const b = { x: 200, y: 0, scale: 1 };
  expect(interpolate(a, b, 0)).toEqual(a);
  const mid = interpolate(a, b, 0.5);
  expect(mid.x).toBeCloseTo(100);
  expect(mid.y).toBeCloseTo(50);
  expect(mid.scale).toBeCloseTo(0.1);
  expect(interpolate(a, b, 1).scale).toBeCloseTo(1);
});

test('fitPoints zooms out until every point fits with the pad around it, centred, and never zooms in', () => {
  const viewport = { w: 1000, h: 800 };
  const c = { x: 0, y: 0, scale: 1 };
  const points = [{ x: 0, y: 0 }, { x: 4200, y: 0 }, { x: 2000, y: 1000 }];
  const fitted = fitPoints(c, points, viewport);
  // Wide, so the width decides: 4200 world units across 1000 - 2 * 80 px.
  expect(fitted.scale).toBeCloseTo((1000 - 2 * FIT_PAD_PX) / 4200, 9);
  const shown = points.map((p) => worldToScreen(fitted, p));
  for (const p of shown) {
    expect(p.x).toBeGreaterThanOrEqual(FIT_PAD_PX - 1e-6);
    expect(p.x).toBeLessThanOrEqual(1000 - FIT_PAD_PX + 1e-6);
    expect(p.y).toBeGreaterThanOrEqual(FIT_PAD_PX - 1e-6);
    expect(p.y).toBeLessThanOrEqual(800 - FIT_PAD_PX + 1e-6);
  }
  expect((shown[0].x + shown[1].x) / 2).toBeCloseTo(500, 6);
  // A short line that already fits is brought to the middle at the scale it had.
  const small = fitPoints(c, [{ x: 3000, y: 0 }, { x: 3100, y: 50 }], viewport);
  expect(small.scale).toBe(1);
  expect(worldToScreen(small, { x: 3050, y: 25 })).toEqual({ x: 500, y: 400 });
  // Nothing to fit leaves the camera alone.
  expect(fitPoints(c, [], viewport)).toBe(c);
});

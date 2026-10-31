import type { Point } from './geometry';

/**
 * The glass you look through. Screen = world * scale + (x, y). Panning and zooming
 * never move a station; they move the camera.
 */
export interface Camera {
  x: number;
  y: number;
  scale: number;
}

/** Pixels per second of plan: a month fits across a screen at the far end. */
export const MIN_SCALE = 0.0002;
/** Zoomed all the way in, a second of plan is twenty pixels. */
export const MAX_SCALE = 20;
/** The scale the camera flies to when it follows the train. */
export const MOTION_SCALE = MAX_SCALE;

export const HOME: Camera = { x: 0, y: 0, scale: 0.01 };

function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

export function worldToScreen(c: Camera, p: Point): Point {
  return { x: p.x * c.scale + c.x, y: p.y * c.scale + c.y };
}

export function screenToWorld(c: Camera, p: Point): Point {
  return { x: (p.x - c.x) / c.scale, y: (p.y - c.y) / c.scale };
}

export function panBy(c: Camera, dx: number, dy: number): Camera {
  return { ...c, x: c.x + dx, y: c.y + dy };
}

/** Zooms so that the world point under `screen` stays under it. */
export function zoomAt(c: Camera, screen: Point, factor: number): Camera {
  const scale = clampScale(c.scale * factor);
  const under = screenToWorld(c, screen);
  return { x: screen.x - under.x * scale, y: screen.y - under.y * scale, scale };
}

/** A camera at `scale` with `world` in the middle of the viewport. */
export function centerOn(_c: Camera, world: Point, viewport: { w: number; h: number }, scale: number): Camera {
  const s = clampScale(scale);
  return { x: viewport.w / 2 - world.x * s, y: viewport.h / 2 - world.y * s, scale: s };
}

/** How much of the viewport width a leg should fill, as a scale, kept inside the zoom range. */
export function fitLeg(legSeconds: number, viewportW: number, fraction = 1 / 3): number {
  if (legSeconds === 0) return MAX_SCALE;
  return clampScale((viewportW * fraction) / legSeconds);
}

/** A camera part of the way from a to b: straight in position, geometric in scale so zoom feels even. */
export function interpolate(a: Camera, b: Camera, t: number): Camera {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    scale: a.scale * (b.scale / a.scale) ** t,
  };
}

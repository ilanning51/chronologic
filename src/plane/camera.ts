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

export const MIN_SCALE = 0.25;
export const MAX_SCALE = 4;
export const DEFAULT_ZOOM = 1;
/** The zoom the camera flies to on a running stretch: labels at 17 px, the line thick. */
export const STRETCH_ZOOM = 1.6;

export const HOME: Camera = { x: 0, y: 0, scale: DEFAULT_ZOOM };

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

export function cssTransform(c: Camera): string {
  return `translate(${c.x}px, ${c.y}px) scale(${c.scale})`;
}

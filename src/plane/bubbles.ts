import type { Point } from './geometry';

/** How far in from the window edge a bubble sits, so it never touches the glass. */
export const BUBBLE_INSET_PX = 16;

/**
 * Where a bubble for an off-screen target sits: the point where the ray from the viewport
 * centre to the target crosses the edge, pulled in by the inset. Null when the target is
 * already on screen.
 */
export function bubbleFor(target: Point, viewport: { w: number; h: number }): Point | null {
  if (target.x >= 0 && target.x <= viewport.w && target.y >= 0 && target.y <= viewport.h) return null;
  const cx = viewport.w / 2;
  const cy = viewport.h / 2;
  const dx = target.x - cx;
  const dy = target.y - cy;
  // The target is outside, so it is not the centre and at least one of dx, dy is nonzero.
  const tx = dx === 0 ? Infinity : (dx > 0 ? viewport.w - BUBBLE_INSET_PX - cx : BUBBLE_INSET_PX - cx) / dx;
  const ty = dy === 0 ? Infinity : (dy > 0 ? viewport.h - BUBBLE_INSET_PX - cy : BUBBLE_INSET_PX - cy) / dy;
  const t = Math.min(tx, ty);
  return { x: cx + t * dx, y: cy + t * dy };
}

import type { Point } from './geometry';

/** How far in from the window edge a bubble sits, so it never touches the glass. */
export const BUBBLE_INSET_PX = 16;

/** Half a bubble's height: its least height is the 44 px tap target. */
const BUBBLE_HALF_PX = 22;

/** How far along the top edge from the corner a centred bubble could still reach back over it. */
const TOP_REACH_PX = 100;

/** Where a bubble sits, and which inset edge it hangs from. */
export interface BubbleSpot extends Point {
  side: 'left' | 'right' | 'top' | 'bottom';
}

/**
 * Where a bubble for an off-screen target sits: the point where the ray from the viewport
 * centre to the target crosses the edge, pulled in by the inset, and the edge it crossed. Null when the target is
 * already on screen.
 */
export function bubbleFor(target: Point, viewport: { w: number; h: number }): BubbleSpot | null {
  if (target.x >= 0 && target.x <= viewport.w && target.y >= 0 && target.y <= viewport.h) return null;
  const cx = viewport.w / 2;
  const cy = viewport.h / 2;
  const dx = target.x - cx;
  const dy = target.y - cy;
  // The target is outside, so it is not the centre and at least one of dx, dy is nonzero.
  const tx = dx === 0 ? Infinity : (dx > 0 ? viewport.w - BUBBLE_INSET_PX - cx : BUBBLE_INSET_PX - cx) / dx;
  const ty = dy === 0 ? Infinity : (dy > 0 ? viewport.h - BUBBLE_INSET_PX - cy : BUBBLE_INSET_PX - cy) / dy;
  const t = Math.min(tx, ty);
  const side = tx <= ty ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'bottom' : 'top';
  return { x: cx + t * dx, y: cy + t * dy, side };
}

/**
 * Keeps a bubble clear of a HUD piece in the top-left corner, given as the corner's size in px.
 * A bubble on the left edge that would overlap it moves down to just below it; one on the top
 * edge near it, whose width is not known here, hangs from the left edge just below it instead.
 * Anywhere else it stays where it was.
 */
export function clearOf(spot: BubbleSpot, corner: { w: number; h: number }): BubbleSpot {
  const below = corner.h + BUBBLE_HALF_PX;
  if (spot.side === 'left' && spot.y < below) return { ...spot, y: below };
  if (spot.side === 'top' && spot.x < corner.w + TOP_REACH_PX) return { x: BUBBLE_INSET_PX, y: below, side: 'left' };
  return spot;
}

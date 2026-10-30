/** Below this camera scale the plane is shapes and lines only, as text at four pixels is noise. */
export const LABEL_HIDE_BELOW = 0.5;

const LABEL_PX = 13;
const LABEL_ZOOMED_PX = 17;

/**
 * The size of a station label in screen pixels, or null when labels hide. Labels never
 * shrink below 13 px while zooming out, and grow to 17 px as you zoom in on a stretch.
 */
export function labelFontPx(scale: number): number | null {
  if (scale < LABEL_HIDE_BELOW) return null;
  return Math.min(LABEL_ZOOMED_PX, Math.max(LABEL_PX, LABEL_PX * scale));
}

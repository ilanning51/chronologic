/**
 * World geometry in world units (CSS px at scale 1). SVG attributes cannot read the CSS
 * tokens, so the line's sizes live here and tokens.css carries the same numbers for
 * the HTML shapes.
 */
export const LINE_WIDTH = 10;
export const TERMINUS_WIDTH = 10;
export const TERMINUS_LENGTH = 26;
export const TRAIN_LENGTH = 30;
export const TRAIN_WIDTH = 20;
export const TRAIN_RADIUS = 6;

/** How close, in screen pixels, a drawing finger has to pass a station to pick it up. */
export const HIT_RADIUS_PX = 24;

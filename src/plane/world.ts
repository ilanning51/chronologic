import type { Shape, Size } from '../model/types';

/**
 * Screen geometry in CSS pixels. Only positions scale with zoom; every size here is
 * constant, so a month-long track is as thick as a minute-long one.
 */
export const TRACK_WIDTH = 10;
/** How far apart, centre to centre, lines run where they share a road: a hairline of paper between them. */
export const LANE_PX = TRACK_WIDTH + 2;
export const TRAIN = { length: 30, width: 20, radius: 6 };
/** The least hit target for anything pressable, matching --tap in the tokens. */
export const TAP_PX = 44;
/** A finished stop, drawn as a dot whatever its shape. */
export const DOT = 10;

export const SHAPE_PX: Record<Shape, Record<Size, { w: number; h: number }>> = {
  circle: { small: { w: 14, h: 14 }, medium: { w: 22, h: 22 }, large: { w: 30, h: 30 } },
  triangle: { small: { w: 16, h: 14 }, medium: { w: 24, h: 22 }, large: { w: 32, h: 30 } },
  square: { small: { w: 13, h: 13 }, medium: { w: 20, h: 20 }, large: { w: 28, h: 28 } },
};

/** How close, in screen pixels, a drawing finger has to pass a stop to pick it up. */
export const SNAP_PX = 24;
/** The margin, in screen pixels, a kept selection box leaves around what it caught. */
export const BOX_PAD_PX = 24;
/** The least horizontal space, in screen pixels, between two stop labels. */
export const LABEL_ROOM_PX = 80;

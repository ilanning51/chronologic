import { VIGNELLI } from './vignelli';

/**
 * Screen geometry in CSS pixels. Only positions scale with zoom; every size here is
 * constant, so a month-long track is as thick as a minute-long one.
 */
export const TRACK_WIDTH = 12;
/** How far apart, centre to centre, lines run where they share a road: a tenth of a line of paper between them. */
export const LANE_PX = TRACK_WIDTH * VIGNELLI.lanePitch;
/**
 * How far before a corner, in screen pixels, the innermost line of a turn leaves the straight: the
 * map's tightest curves, the same at any zoom. A 45 degree turn sweeps a radius of 22 px, a right
 * angle 9 px.
 */
export const BEND_CUT_PX = TRACK_WIDTH * VIGNELLI.bendCut;
export const TRAIN = { length: 30, width: 20, radius: 6 };
/** The least hit target for anything pressable, matching --tap in the tokens. */
export const TAP_PX = 44;
/** A finished stop, drawn as a dot whatever its shape. */
export const DOT = 10;

/** A station's disc across, in screen pixels: one line wide, as every station on the map is. Matches --disc in the tokens. */
export const DISC_PX = TRACK_WIDTH * VIGNELLI.disc;

/** How close, in screen pixels, a drawing finger has to pass a stop to pick it up. */
export const SNAP_PX = 24;
/** The margin, in screen pixels, a kept selection box leaves around what it caught. */
export const BOX_PAD_PX = 24;
/** The least horizontal space, in screen pixels, between two stop labels. */
export const LABEL_ROOM_PX = 80;

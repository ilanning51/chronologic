import type { Size } from '../model/types';
import { VIGNELLI } from './vignelli';

/**
 * Screen geometry in CSS pixels. Only positions scale with zoom; every size here is
 * constant, so a month-long track is as thick as a minute-long one.
 *
 * W, one line's width. On the map a station's name is set at 1.056 W, as tall as the line is
 * thick, so the line is as heavy as the type beside it. At 16 px the names come to 17 px, the
 * size Apple sets body text at, and the line, the discs and every other size follow from it.
 */
export const TRACK_WIDTH = 16;
/** How far apart, centre to centre, lines run where they share a road: a tenth of a line of paper between them. */
export const LANE_PX = TRACK_WIDTH * VIGNELLI.lanePitch;
/**
 * How far before a corner, in screen pixels, the innermost line of a turn leaves the straight: the
 * map's tightest curves, the same at any zoom. A 45 degree turn sweeps a radius of 29 px, a right
 * angle 12 px.
 */
export const BEND_CUT_PX = TRACK_WIDTH * VIGNELLI.bendCut;
/** A train, in proportion to its line: two and a half lines long, a line and two thirds wide. */
export const TRAIN = { length: TRACK_WIDTH * 2.5, width: (TRACK_WIDTH * 5) / 3, radius: TRACK_WIDTH / 2 };
/** The least hit target for anything pressable, matching --tap in the tokens. */
export const TAP_PX = 44;
/** A finished stop, drawn as a dot whatever its shape. */
export const DOT = 10;

/**
 * A station's disc across, in screen pixels, by the task's size: one line wide, as the map's are,
 * and a step larger for a larger task, small enough steps that every disc still reads as a station.
 * Matches --disc-* in the tokens.
 */
export const DISC_PX: Record<Size, number> = { small: TRACK_WIDTH, medium: TRACK_WIDTH * 1.12, large: TRACK_WIDTH * 1.25 };

/** How close, in screen pixels, a drawing finger has to pass a stop to pick it up. */
export const SNAP_PX = 24;
/** The margin, in screen pixels, a kept selection box leaves around what it caught. */
export const BOX_PAD_PX = 24;
/** The least horizontal space, in screen pixels, between two stop labels: six and a half lines, as names scale with the line. */
export const LABEL_ROOM_PX = TRACK_WIDTH * 6.5;

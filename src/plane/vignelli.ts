/**
 * The map's proportions, measured off the MTA's 2025 subway map (the PDF in the inspo folder) and
 * written as multiples of W, the width of one line. Every size the plane draws a line, a station or
 * a label at comes from here, times the line width, so the whole drawing scales as one.
 *
 * How each was measured, at W = 8.23 pt on the PDF's own vectors:
 * - lanePitch: centre to centre of two lines sharing a road, 9.05 pt; the paper between them 0.1 W.
 * - casing: the white stroke under every line, 10.06 pt, so 0.11 W shows each side of it.
 * - bendCut: where a ribbon turns, its innermost line leaves the straight 0.75 W before the corner;
 *   every line outside it turns about the same centre, so the curves are concentric.
 * - disc: a station is a black disc one W across, keylined in white 0.1 W wide.
 * - bar, capsulePad, capsuleOutline: a transfer joins its discs with a bar 0.39 W thick, inside a
 *   white capsule 0.08 W clear of the discs, outlined in black 0.087 W.
 * - labelSize, labelGap, labelLeading, capCentre: names are set at 1.056 W, 0.25 W clear of the disc,
 *   at 1.05 leading, with the first line's capitals centred on the disc, their baseline 0.38 W below it.
 */
export const VIGNELLI = {
  lanePitch: 1.1,
  casing: 0.11,
  bendCut: 0.75,
  disc: 1,
  discRing: 0.1,
  bar: 0.39,
  capsulePad: 0.08,
  capsuleOutline: 0.087,
  labelSize: 1.056,
  labelGap: 0.25,
  labelLeading: 1.05,
  capCentre: 0.38,
} as const;

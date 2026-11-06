/** The map's ink, a warm near-black, as tokens.css sets --ink. */
export const INK = '#1C1B1A';

/**
 * The eight track colours, in the order a new track takes them: the trunk colours of the New York
 * subway map, sampled off the MTA's 2025 map. Grey is left out, as grey already means road
 * travelled. A saved line keeps only its index, so it keeps its slot and its pitch whatever the
 * colours are.
 *
 * `fill` is the colour where words sit on the line's colour, and `on` the colour of those words:
 * whichever of ink and white reads better, as the map's bullets carry black letters on yellow and
 * white ones on red. Blue and brown read at 4.5:1 under white only a shade darker than the map
 * prints them, so their fill is that shade; every other fill is the line's own colour.
 */
export const PALETTE: readonly { name: string; color: string; fill: string; on: string; pitchHz: number }[] = [
  { name: 'blue', color: '#007EC5', fill: '#007CC2', on: '#FFFFFF', pitchHz: 262 },
  { name: 'yellow', color: '#FFD200', fill: '#FFD200', on: INK, pitchHz: 330 },
  { name: 'green', color: '#009862', fill: '#009862', on: INK, pitchHz: 392 },
  { name: 'red', color: '#E70B40', fill: '#E70B40', on: '#FFFFFF', pitchHz: 440 },
  { name: 'purple', color: '#AF378A', fill: '#AF378A', on: '#FFFFFF', pitchHz: 494 },
  { name: 'lime', color: '#72B030', fill: '#72B030', on: INK, pitchHz: 523 },
  { name: 'orange', color: '#F18402', fill: '#F18402', on: INK, pitchHz: 587 },
  { name: 'brown', color: '#A7752A', fill: '#9C6D27', on: '#FFFFFF', pitchHz: 659 },
];

/** The CSS variable for a track's color, wrapping past the eighth. */
export function colorVar(index: number): string {
  return `var(--track-${PALETTE[index % PALETTE.length].name})`;
}

/** The CSS variable for a track's colour where words sit on it, wrapping like `colorVar`. */
export function fillVar(index: number): string {
  return `var(--track-${PALETTE[index % PALETTE.length].name}-fill)`;
}

/** The CSS variable for the colour of words set on a track's fill, wrapping like `colorVar`. */
export function onColorVar(index: number): string {
  return `var(--track-${PALETTE[index % PALETTE.length].name}-on)`;
}

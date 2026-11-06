/**
 * The eight track colours, in the order a new track takes them: the trunk colours of the New York
 * subway map, as the MTA prints them. Grey is left out, as grey already means road travelled. A
 * saved line keeps only its index, so it keeps its slot and its pitch whatever the colours are.
 * `on` is the colour of words set on the line's colour: whichever of ink and white reads better,
 * as the map's bullets carry black letters on yellow and white ones on blue.
 */
export const PALETTE: readonly { name: string; color: string; on: string; pitchHz: number }[] = [
  { name: 'blue', color: '#0039A6', on: '#FFFFFF', pitchHz: 262 },
  { name: 'yellow', color: '#FCCC0A', on: '#111111', pitchHz: 330 },
  { name: 'green', color: '#00933C', on: '#111111', pitchHz: 392 },
  { name: 'red', color: '#EE352E', on: '#111111', pitchHz: 440 },
  { name: 'purple', color: '#B933AD', on: '#FFFFFF', pitchHz: 494 },
  { name: 'lime', color: '#6CBE45', on: '#111111', pitchHz: 523 },
  { name: 'orange', color: '#FF6319', on: '#111111', pitchHz: 587 },
  { name: 'brown', color: '#996633', on: '#FFFFFF', pitchHz: 659 },
];

/** The CSS variable for a track's color, wrapping past the eighth. */
export function colorVar(index: number): string {
  return `var(--track-${PALETTE[index % PALETTE.length].name})`;
}

/** The CSS variable for the colour of words set on a track's colour, wrapping like `colorVar`. */
export function onColorVar(index: number): string {
  return `var(--track-${PALETTE[index % PALETTE.length].name}-on)`;
}

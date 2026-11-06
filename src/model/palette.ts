/**
 * The eight track colours, in the order a new track takes them: the trunk colours of the New York
 * subway map, as the MTA prints them. Grey is left out, as grey already means road travelled. A
 * saved line keeps only its index, so it keeps its slot and its pitch whatever the colours are.
 */
export const PALETTE: readonly { name: string; color: string; pitchHz: number }[] = [
  { name: 'blue', color: '#0039A6', pitchHz: 262 },
  { name: 'yellow', color: '#FCCC0A', pitchHz: 330 },
  { name: 'green', color: '#00933C', pitchHz: 392 },
  { name: 'red', color: '#EE352E', pitchHz: 440 },
  { name: 'purple', color: '#B933AD', pitchHz: 494 },
  { name: 'lime', color: '#6CBE45', pitchHz: 523 },
  { name: 'orange', color: '#FF6319', pitchHz: 587 },
  { name: 'brown', color: '#996633', pitchHz: 659 },
];

/** The CSS variable for a track's color, wrapping past the eighth. */
export function colorVar(index: number): string {
  return `var(--track-${PALETTE[index % PALETTE.length].name})`;
}

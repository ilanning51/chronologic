/** The eight track colours, in the order a new track takes them. Each owns a pitch for its completions. */
export const PALETTE: readonly { name: string; color: string; pitchHz: number }[] = [
  { name: 'blue', color: '#2440A4', pitchHz: 262 },
  { name: 'ochre', color: '#A67C00', pitchHz: 330 },
  { name: 'green', color: '#1F7A3A', pitchHz: 392 },
  { name: 'red', color: '#C4251F', pitchHz: 440 },
  { name: 'plum', color: '#6B2D8B', pitchHz: 494 },
  { name: 'teal', color: '#0F6E7A', pitchHz: 523 },
  { name: 'rust', color: '#B5500F', pitchHz: 587 },
  { name: 'slate', color: '#3D4F63', pitchHz: 659 },
];

/** The CSS variable for a track's color, wrapping past the eighth. */
export function colorVar(index: number): string {
  return `var(--track-${PALETTE[index % PALETTE.length].name})`;
}

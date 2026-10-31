interface GhostProps {
  x: number;
  y: number;
  shape: 'circle' | 'triangle';
  /** On a line: the ghost fills solid; otherwise it is muted. */
  snapped: boolean;
}

/** The shape being carried from the tray: under the finger, or sitting on the line it would join. */
export function Ghost({ x, y, shape, snapped }: GhostProps) {
  return (
    <span aria-hidden="true" className={snapped ? 'ghost snapped' : 'ghost'} style={{ left: x, top: y }}>
      <span className={`shape ${shape} medium`} />
    </span>
  );
}

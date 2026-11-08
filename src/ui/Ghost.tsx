import type { Size } from '../model/types';

interface GhostProps {
  x: number;
  y: number;
  shape: 'circle' | 'triangle' | 'square';
  /** Medium for a tile from the tray; a step split off a stop takes that stop's size. */
  size?: Size;
  /** On a line: the ghost fills solid; otherwise it is muted. */
  snapped: boolean;
}

/** The shape being carried, from the tray or split off a stop: under the finger, or sitting on the line it would join. */
export function Ghost({ x, y, shape, size = 'medium', snapped }: GhostProps) {
  return (
    <span aria-hidden="true" className={snapped ? 'ghost snapped' : 'ghost'} style={{ left: x, top: y }}>
      <span className={`shape ${shape} ${size}`} />
    </span>
  );
}

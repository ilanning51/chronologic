import type { CSSProperties } from 'react';
import { colorVar } from '../model/palette';
import type { Size } from '../model/types';

interface GhostProps {
  x: number;
  y: number;
  shape: 'circle' | 'triangle' | 'square';
  /** Medium for a tile from the tray; a step split off a stop takes that stop's size. */
  size?: Size;
  /** On a line: the ghost fills solid; otherwise it is muted. */
  snapped: boolean;
  /**
   * Where a carried goal would land on the life line: its project's palette index. The ghost is
   * drawn as the goal will be there, in that colour with its white square.
   */
  landing?: number;
}

/** The shape being carried, from the tray or split off a stop: under the finger, or sitting on the line it would join. */
export function Ghost({ x, y, shape, size = 'medium', snapped, landing }: GhostProps) {
  const className = ['ghost', snapped && 'snapped', landing !== undefined && 'landing'].filter(Boolean).join(' ');
  const style = { left: x, top: y, ...(landing !== undefined ? { ['--home-color' as string]: colorVar(landing) } : {}) } as CSSProperties;
  return (
    <span aria-hidden="true" className={className} style={style}>
      <span className={`shape ${shape} ${size}`} />
    </span>
  );
}

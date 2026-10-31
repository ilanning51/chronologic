import type { CSSProperties } from 'react';
import { colorVar } from '../model/palette';
import type { Shape } from '../model/types';

interface BubbleProps {
  /** The id of the track this bubble speaks for. */
  track: string;
  /** The track's palette index. */
  color: number;
  shape: Shape;
  title: string;
  /** Where the bubble's centre sits on screen. */
  x: number;
  y: number;
}

const SHAPE_WORDS: Record<Shape, string> = { circle: 'step', triangle: 'sub-goal', square: 'goal' };

/** A paper pill on the window edge naming what a line points at, off screen in that direction. */
export function Bubble({ track, color, shape, title, x, y }: BubbleProps) {
  return (
    <button
      type="button"
      className="bubble"
      data-target="bubble"
      data-track={track}
      aria-label={`${title || 'Unnamed'}, ${SHAPE_WORDS[shape]}. Tap to change what this line points at.`}
      style={{ left: x, top: y, ['--track-color' as string]: colorVar(color) } as CSSProperties}
    >
      <span aria-hidden="true" className={`shape ${shape} medium`} />
      <span aria-hidden="true" className="title">
        {title}
      </span>
    </button>
  );
}

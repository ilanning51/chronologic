import type { CSSProperties } from 'react';
import { colorVar } from '../model/palette';
import type { Shape } from '../model/types';

/** Anchors the pill by the edge it hangs from, so it always lies inside the window. */
const ANCHOR: Record<'left' | 'right' | 'top' | 'bottom', string> = {
  right: 'translate(-100%, -50%)',
  left: 'translate(0, -50%)',
  top: 'translate(-50%, 0)',
  bottom: 'translate(-50%, -100%)',
};

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
  /** The window edge the bubble hangs from. */
  side: 'left' | 'right' | 'top' | 'bottom';
}

const SHAPE_WORDS: Record<Shape, string> = { circle: 'step', triangle: 'sub-goal', square: 'goal' };

/** A paper pill on the window edge naming what a line points at, off screen in that direction. */
export function Bubble({ track, color, shape, title, x, y, side }: BubbleProps) {
  return (
    <button
      type="button"
      className="bubble"
      data-target="bubble"
      data-track={track}
      aria-label={`${title || 'Unnamed'}, ${SHAPE_WORDS[shape]}. Tap to change what this line points at.`}
      style={{ left: x, top: y, transform: ANCHOR[side], ['--track-color' as string]: colorVar(color) } as CSSProperties}
    >
      <span aria-hidden="true" className={`shape ${shape} medium`} />
      <span aria-hidden="true" className="title">
        {title}
      </span>
    </button>
  );
}

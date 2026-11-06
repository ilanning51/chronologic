import type { CSSProperties } from 'react';
import { colorVar, fillVar, onColorVar } from '../model/palette';
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
  /** The goal's picture, shown in place of its shape. */
  image?: string;
  /** Where the bubble's centre sits on screen. */
  x: number;
  y: number;
  /** The window edge the bubble hangs from. */
  side: 'left' | 'right' | 'top' | 'bottom';
  /** The line whose train arrives first: its bubble is filled with its colour. */
  soonest?: boolean;
  /** The day line, whose colour is the ink. */
  day?: boolean;
  /** A sketch, a line with only its goal: muted like the line, its train and its goal. */
  sketch?: boolean;
}

const SHAPE_WORDS: Record<Shape, string> = { circle: 'step', triangle: 'sub-goal', square: 'goal' };

/**
 * A black plate on the window edge naming what a line points at, off screen in that direction:
 * the target's shape as a bullet in the line's colour, its name in white, the way the subway map
 * sets a sign. A square is a goal, and a goal's name is set in bold capitals, as a terminus is on the map. A
 * goal with a picture has no pill: the bubble is the picture itself, centred in a square of the
 * line's colour, so the thing the line is for is a glance away from anywhere, framed in its line.
 */
export function Bubble({ track, color, shape, title, image, x, y, side, soonest = false, day = false, sketch = false }: BubbleProps) {
  const ink = day ? 'var(--ink)' : sketch ? 'var(--muted)' : colorVar(color);
  // Words set on that colour: white on the ink and the muted grey, else the line's own.
  const on = day || sketch ? 'var(--on-plate)' : onColorVar(color);
  // The line's colour where words sit on it, a shade darker for blue and brown.
  const fill = day ? 'var(--ink)' : sketch ? 'var(--muted)' : fillVar(color);
  return (
    <button
      type="button"
      className={['bubble', image !== undefined && 'picture', soonest && 'soonest', day && 'day'].filter(Boolean).join(' ')}
      data-target="bubble"
      data-track={track}
      aria-label={`${title || 'Unnamed'}, ${SHAPE_WORDS[shape]}. Tap to change what this line points at.`}
      style={{ left: x, top: y, transform: ANCHOR[side], ['--track-color' as string]: ink, ['--track-on' as string]: on, ['--track-fill' as string]: fill } as CSSProperties}
    >
      {image !== undefined ? (
        <img aria-hidden="true" alt="" className="mural" src={image} draggable={false} />
      ) : (
        <>
          {/* The bullet's keyline is drawn on this wrapper: a clipped triangle cannot carry its own. */}
          <span aria-hidden="true" className="bullet">
            <span className={`shape ${shape} medium`} />
          </span>
          <span aria-hidden="true" className={shape === 'square' ? 'title goal-name' : 'title'}>
            {title}
          </span>
        </>
      )}
    </button>
  );
}

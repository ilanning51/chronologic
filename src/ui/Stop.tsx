import type { CSSProperties } from 'react';
import { colorVar } from '../model/palette';
import type { Shape, Size } from '../model/types';
import type { StopView } from '../plane/layout';

interface StopProps {
  stop: StopView;
  /** The id of the track this stop belongs to. */
  track: string;
  /** The track's palette index; press and focus fill the shape with it. */
  color: number;
  /** Whether the whole track is done, which dims its dots to the muted ink. */
  finished?: boolean;
}

const SHAPE_WORDS: Record<Shape, string> = { circle: 'step', triangle: 'sub-goal', square: 'goal' };
const SIZE_WORDS: Record<Size, string> = { small: 'small', medium: 'medium', large: 'large' };

/**
 * One task on the plane: a solid shape for its kind and size, a dot once done, a label
 * beneath when there is room. The shape's centre sits on the stop's screen point. The next
 * stop is raised above the rest, so where hit targets crowd it is the one a tap finds.
 */
export function Stop({ stop, track, color, finished = false }: StopProps) {
  const name = [
    stop.title || 'Unnamed',
    SHAPE_WORDS[stop.shape],
    SIZE_WORDS[stop.size],
    stop.done ? 'done' : stop.next ? 'next' : null,
  ]
    .filter(Boolean)
    .join(', ');
  return (
    <button
      type="button"
      className={['stop', stop.done && 'done', stop.next && !stop.done && 'next', finished && 'finished'].filter(Boolean).join(' ')}
      data-target="stop"
      data-id={stop.id}
      data-track={track}
      data-goal={stop.goal ? '' : undefined}
      aria-label={name}
      style={{ left: stop.x, top: stop.y, ['--track-color' as string]: colorVar(color) } as CSSProperties}
    >
      <span aria-hidden="true" className={stop.done ? 'shape dot' : `shape ${stop.shape} ${stop.size}`} />
      {stop.label && stop.title && (
        <span aria-hidden="true" className="label">
          {stop.title}
        </span>
      )}
    </button>
  );
}

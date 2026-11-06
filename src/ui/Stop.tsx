import type { CSSProperties } from 'react';
import { colorVar } from '../model/palette';
import type { Shape, Size } from '../model/types';
import type { StopView } from '../plane/layout';
import { SHAPE_PX } from '../plane/world';
import type { Link } from './stopsOnce';

interface StopProps {
  stop: StopView;
  /** The id of the track this stop belongs to. */
  track: string;
  /** The track's palette index; press and focus fill the shape with it. */
  color: number;
  /** Whether the whole track is done, which dims its dots to the muted ink. */
  finished?: boolean;
  /** On the day line, whose colour is the ink. */
  day?: boolean;
  /** The goal of a sketch, muted with its line. */
  sketch?: boolean;
  /** An interchange whose lines pass it side by side: a transfer across their lanes. */
  link?: Link;
}

const SHAPE_WORDS: Record<Shape, string> = { circle: 'step', triangle: 'sub-goal', square: 'goal' };
const SIZE_WORDS: Record<Size, string> = { small: 'small', medium: 'medium', large: 'large' };

/**
 * One task on the plane: a solid shape for its kind and size, a dot once done, a label
 * beneath when there is room. A project's goal's name is set in bold capitals, and once done it
 * stays as a terminus, a large ink dot with its name, the way a system map keeps its
 * termini. A goal with a picture carries it as a mural above the square, the thing the line is
 * for. The shape's centre sits on the stop's screen point. The next
 * stop is raised above the rest, so where hit targets crowd it is the one a tap finds. A stop
 * on two or more lines is a ring: its own shape in ink around a paper centre. Where a train has
 * long waited, a small crowd of muted dots gathers beside it. Every mark is keylined in paper, as
 * the map's bullets are, so it reads on its line's colour; an interchange whose lines run side by
 * side is joined across their lanes by a transfer, a paper capsule in an ink outline.
 */
/** The paper a transfer leaves around the mark inside it, top and bottom, outline included. */
const LINK_PAD = 5;
/** Where a label hangs below the stop's point, as the stylesheet sets it, and the least gap it keeps below a transfer. */
const LABEL_TOP = 22;
const LABEL_GAP = 4;

export function Stop({ stop, track, color, finished = false, day = false, sketch = false, link }: StopProps) {
  const tall = SHAPE_PX[stop.shape][stop.size].h + 2 * LINK_PAD;
  // A transfer reaching down past the label's place pushes the label below it.
  const below = link ? Math.abs(link.dy) + (Math.abs(Math.sin((link.angle * Math.PI) / 180)) * link.length + tall) / 2 : 0;
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
      className={[
        'stop',
        stop.done && 'done',
        stop.next && !stop.done && 'next',
        finished && 'finished',
        sketch && 'sketch',
        stop.terminus && 'terminus',
      ]
        .filter(Boolean)
        .join(' ')}
      data-target="stop"
      data-id={stop.id}
      data-track={track}
      data-goal={stop.goal ? '' : undefined}
      aria-label={name}
      style={{ left: stop.x, top: stop.y, ['--track-color' as string]: day ? 'var(--ink)' : colorVar(color) } as CSSProperties}
    >
      {stop.image !== undefined && <img aria-hidden="true" alt="" className="mural" src={stop.image} draggable={false} />}
      <span aria-hidden="true" className="mark">
        {link && (
          <span
            className="link"
            style={{
              width: link.length + tall,
              height: tall,
              borderRadius: tall / 2,
              transform: `translate(${link.dx}px, ${link.dy}px) translate(-50%, -50%) rotate(${link.angle}deg)`,
            }}
          />
        )}
        <span className={stop.done ? 'shape dot' : ['shape', stop.ring && 'ring', stop.shape, stop.size].filter(Boolean).join(' ')} />
      </span>
      {stop.crowd > 0 && !stop.done && (
        // A look, not news: the name says nothing of it, and it carries no count.
        <span aria-hidden="true" className="crowd">
          {Array.from({ length: stop.crowd }, (_, i) => (
            <span key={i} className="dot" />
          ))}
        </span>
      )}
      {stop.label && stop.title && (
        <span
          aria-hidden="true"
          className={stop.projectGoal ? 'label goal-name' : 'label'}
          style={below + LABEL_GAP > LABEL_TOP ? { top: below + LABEL_GAP } : undefined}
        >
          {stop.title}
        </span>
      )}
    </button>
  );
}

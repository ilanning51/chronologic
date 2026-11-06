import type { CSSProperties } from 'react';
import { colorVar } from '../model/palette';
import type { Shape, Size } from '../model/types';
import type { StopView } from '../plane/layout';
import { VIGNELLI } from '../plane/vignelli';
import { DISC_PX, TRACK_WIDTH } from '../plane/world';
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
 * One task on the plane, drawn as the map draws a station: an ink disc one line wide, keylined in
 * paper, a little larger for a larger task, with its kind as a white glyph inside it, nothing for a
 * step, a triangle for a sub-goal and a square for a goal. Once done it is a plain disc, and a label
 * sits beside it when there is room. A project's goal's name is set in bold capitals, and once done
 * it stays as a terminus, a large ink disc with its name, the way a system map keeps its termini. A
 * goal with a picture carries it as a mural above the disc, the thing the line is for. The disc's
 * centre sits on the stop's screen point. The next stop is raised above the rest, so where hit
 * targets crowd it is the one a tap finds. Where a train has long waited, a small crowd of muted
 * dots gathers beside it.
 *
 * A stop on two or more lines is a transfer, as on the map: its disc in a paper capsule with a fine
 * ink outline. Where its lines pass side by side the capsule is laid across every lane, with a disc
 * one line wide on each lane, joined by an ink bar.
 */
/** The paper a transfer leaves around the discs inside it, top and bottom, outline included. */
const LINK_PAD = (VIGNELLI.capsulePad + VIGNELLI.capsuleOutline) * TRACK_WIDTH;
/** Where a label hangs below the stop's point, as the stylesheet sets it, and the least gap it keeps below a transfer. */
const LABEL_TOP = 22;
const LABEL_GAP = 4;

export function Stop({ stop, track, color, finished = false, day = false, sketch = false, link }: StopProps) {
  // A transfer's discs are one line wide whatever the task's size, as the map's are, so on lanes
  // 1.1 lines apart they stand just clear of each other.
  const tall = DISC_PX[link ? 'small' : stop.size] + 2 * LINK_PAD;
  const kind = ['ring', stop.shape, stop.size];
  const [first, ...others] = link?.marks ?? [];
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
        link && 'linked',
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
          >
            <span className="bar" style={{ width: link.length }} />
          </span>
        )}
        {others.map((m, i) => (
          <span key={i} className={['disc', ...kind].join(' ')} style={{ left: m.dx, top: m.dy }} />
        ))}
        <span
          className={stop.done ? 'shape dot' : ['shape', stop.ring && 'ring', stop.shape, stop.size].filter(Boolean).join(' ')}
          style={first ? { left: first.dx, top: first.dy } : undefined}
        />
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

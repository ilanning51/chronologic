import { colorVar } from '../model/palette';
import type { TrackView } from '../plane/layout';
import { TAP_PX, TRACK_WIDTH, TRAIN } from '../plane/world';

interface TrackProps {
  view: TrackView;
}

/**
 * One track as thick opaque lines and its train. The svg is a single pixel at the origin
 * that draws outside its own box, since the segments are already in screen pixels. It is
 * drawn before the stops, so a train waiting at a stop sits beneath it and the stop takes
 * the tap. Only a rolling train is a target of its own, and it carries an unpainted 44 px square
 * beneath it so the 30 by 20 body is not all a finger has to find. The start of the line has the
 * same square and nothing drawn: the rounded end of the line is the handle.
 */
export function Track({ view }: TrackProps) {
  // A sketch is a thought, not yet a plan: muted and thin, train and all.
  const color = view.finished || view.sketch ? 'var(--muted)' : view.day ? 'var(--ink)' : colorVar(view.color);
  const width = view.sketch ? TRACK_WIDTH / 2 : TRACK_WIDTH;
  const { train } = view;
  const rolling = !train.waiting && !train.parked;
  const target = rolling ? { 'data-target': 'train', 'data-track': view.id } : {};
  const place = `translate(${train.x}px, ${train.y}px) rotate(${train.angle}deg)`;
  return (
    <svg className="track" aria-hidden="true" width={1} height={1}>
      <rect
        className="origin-hit"
        data-target="origin"
        data-track={view.id}
        x={-TAP_PX / 2}
        y={-TAP_PX / 2}
        width={TAP_PX}
        height={TAP_PX}
        fill="none"
        pointerEvents="all"
        style={{ transform: `translate(${view.origin.x}px, ${view.origin.y}px)` }}
      />
      {view.segments.map(([a, b], i) => (
        <line
          key={i}
          x1={a.x}
          y1={a.y}
          x2={b.x}
          y2={b.y}
          style={{ stroke: color, strokeWidth: width, strokeLinecap: 'round' }}
        />
      ))}
      {rolling && (
        <rect
          className="train-hit"
          {...target}
          x={-TAP_PX / 2}
          y={-TAP_PX / 2}
          width={TAP_PX}
          height={TAP_PX}
          fill="none"
          pointerEvents="all"
          style={{ transform: place }}
        />
      )}
      <rect
        className="train"
        data-train=""
        {...target}
        x={-TRAIN.length / 2}
        y={-TRAIN.width / 2}
        width={TRAIN.length}
        height={TRAIN.width}
        rx={TRAIN.radius}
        style={{ fill: color, transform: place }}
      />
    </svg>
  );
}

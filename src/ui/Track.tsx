import { colorVar } from '../model/palette';
import type { TrackView } from '../plane/layout';
import { TRACK_WIDTH, TRAIN } from '../plane/world';

interface TrackProps {
  view: TrackView;
}

/**
 * One track as thick opaque lines and its train. The svg is a single pixel at the origin
 * that draws outside its own box, since the segments are already in screen pixels. It is
 * drawn before the stops, so a train waiting at a stop sits beneath it and the stop takes
 * the tap. Only a rolling train is a target of its own.
 */
export function Track({ view }: TrackProps) {
  const color = view.finished ? 'var(--muted)' : colorVar(view.color);
  const { train } = view;
  const rolling = !train.waiting && !train.parked;
  const target = rolling ? { 'data-target': 'train', 'data-track': view.id } : {};
  return (
    <svg className="track" aria-hidden="true" width={1} height={1}>
      {view.segments.map(([a, b], i) => (
        <line
          key={i}
          x1={a.x}
          y1={a.y}
          x2={b.x}
          y2={b.y}
          style={{ stroke: color, strokeWidth: TRACK_WIDTH, strokeLinecap: 'round' }}
        />
      ))}
      <rect
        className="train"
        data-train=""
        {...target}
        x={-TRAIN.length / 2}
        y={-TRAIN.width / 2}
        width={TRAIN.length}
        height={TRAIN.width}
        rx={TRAIN.radius}
        style={{ fill: color, transform: `translate(${train.x}px, ${train.y}px) rotate(${train.angle}deg)` }}
      />
    </svg>
  );
}

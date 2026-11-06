import { colorVar } from '../model/palette';
import type { TrackView } from '../plane/layout';
import type { Point } from '../plane/geometry';
import { VIGNELLI } from '../plane/vignelli';
import { TAP_PX, TRACK_WIDTH, TRAIN } from '../plane/world';

/** Segments as one path, each its own move and line. */
const pathOf = (segments: [Point, Point][]) => segments.map(([a, b]) => `M${a.x} ${a.y}L${b.x} ${b.y}`).join('');

interface TrackProps {
  view: TrackView;
}

/**
 * One track as thick opaque lines and its train. The svg is a single pixel at the origin
 * that draws outside its own box, since the segments are already in screen pixels. The road
 * behind the train is muted and the road ahead is the line's colour, so the picture says how far
 * along the line is; the train covers the join. It is
 * drawn before the stops, so a train waiting at a stop sits beneath it and the stop takes
 * the tap. Only a rolling train is a target of its own, and it carries an unpainted 44 px square
 * beneath it so the 30 by 20 body is not all a finger has to find. The start of the line has the
 * same square and nothing drawn: the rounded end of the line is the handle. Inside the svg, later
 * is on top, so the hit squares come after the lines or the stroke would take the press.
 *
 * Under the whole line runs a casing of paper a little wider than it, as on the map: where a line
 * crosses one drawn before it, it parts that one with white, and lines side by side on a road are
 * kept apart by a hairline of paper.
 */
export function Track({ view }: TrackProps) {
  // A sketch is a thought, not yet a plan, and tomorrow is not yet today: muted and thin, train and all.
  const faint = view.sketch || view.tomorrow;
  const color = view.finished || faint ? 'var(--muted)' : view.day ? 'var(--ink)' : colorVar(view.color);
  const width = faint ? TRACK_WIDTH / 2 : TRACK_WIDTH;
  const casing = width + 2 * VIGNELLI.casing * TRACK_WIDTH;
  const all = [...view.behind, ...view.segments];
  const { train } = view;
  const rolling = !train.waiting && !train.parked;
  const target = rolling ? { 'data-target': 'train', 'data-track': view.id } : {};
  const place = `translate(${train.x}px, ${train.y}px) rotate(${train.angle}deg)`;
  return (
    <svg className="track" aria-hidden="true" width={1} height={1}>
      {all.length > 0 && (
        <path
          className="casing"
          d={pathOf(all)}
          fill="none"
          style={{ stroke: 'var(--paper)', strokeWidth: casing, strokeLinecap: 'round', strokeLinejoin: 'round' }}
        />
      )}
      {view.behind.map(([a, b], i) => (
        <line
          key={`behind-${i}`}
          className="behind"
          x1={a.x}
          y1={a.y}
          x2={b.x}
          y2={b.y}
          style={{ stroke: 'var(--muted)', strokeWidth: width, strokeLinecap: 'round' }}
        />
      ))}
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
      {/* After the lines, so the stroke never takes the press; before the train, so a train just departed is still a train. */}
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

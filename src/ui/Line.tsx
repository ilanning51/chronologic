import type { Point } from '../plane/geometry';
import { routeThrough, terminusOf, trainOn } from '../plane/routing';
import { LINE_WIDTH, TERMINUS_LENGTH, TERMINUS_WIDTH, TRAIN_LENGTH, TRAIN_RADIUS, TRAIN_WIDTH } from '../plane/world';

interface LineProps {
  /** The stations the color reaches, in line order. Beyond stations are not here. */
  points: Point[];
  /** While drawing, the finger's world position; the line follows it and shows no end. */
  tail?: Point;
  /** The line's color as the theme writes it. */
  color: string;
  /** Index into points of the next pending station, or null when nothing is pending. */
  nextIndex: number | null;
  /** Whether to draw the terminus bar after the last point. */
  terminus: boolean;
  /** Whether a station is under a finger; the train and terminus then snap instead of easing. */
  dragging?: boolean;
}

/** The colored line: a routed polyline, the terminus bar that is the only fit signal, and the train. */
export function Line({ points, tail, color, nextIndex, terminus, dragging = false }: LineProps) {
  if (points.length === 0) return null;
  const route = routeThrough(points);
  const end = terminusOf(route);
  const vertices = tail ? routeThrough([...points, tail]).vertices : [...route.vertices, end.at];
  const path = vertices.map((v) => `${v.x},${v.y}`).join(' ');
  const train = nextIndex !== null && !tail ? trainOn(route, nextIndex) : null;

  return (
    <svg className={dragging ? 'line dragging' : 'line'} aria-hidden="true" width="1" height="1">
      <polyline
        points={path}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ stroke: color, strokeWidth: LINE_WIDTH }}
      />
      {terminus && !tail && (
        <rect
          data-terminus=""
          className="terminus"
          x={-TERMINUS_WIDTH / 2}
          y={-TERMINUS_LENGTH / 2}
          width={TERMINUS_WIDTH}
          height={TERMINUS_LENGTH}
          rx={TERMINUS_WIDTH / 2}
          style={{ fill: color, transform: `translate(${end.at.x}px, ${end.at.y}px) rotate(${end.angle}deg)` }}
        />
      )}
      {train && (
        <rect
          data-train=""
          data-next={nextIndex}
          className="train"
          x={-TRAIN_LENGTH / 2}
          y={-TRAIN_WIDTH / 2}
          width={TRAIN_LENGTH}
          height={TRAIN_WIDTH}
          rx={TRAIN_RADIUS}
          style={{ fill: color, transform: `translate(${train.at.x}px, ${train.at.y}px) rotate(${train.angle}deg)` }}
        />
      )}
    </svg>
  );
}

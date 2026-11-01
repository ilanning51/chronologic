import type { Point } from '../plane/geometry';
import { TRACK_WIDTH } from '../plane/world';

interface DayGhostProps {
  /** Screen points: where the sun was picked up, each stop collected so far, then the finger. */
  points: Point[];
}

/**
 * The day being drawn, before it is a day: an ink line through what the finger has gathered.
 * Like a track, a one-pixel svg that draws outside its own box in screen pixels.
 */
export function DayGhost({ points }: DayGhostProps) {
  return (
    <svg className="day-ghost" aria-hidden="true" width={1} height={1}>
      <polyline
        points={points.map((p) => `${p.x},${p.y}`).join(' ')}
        fill="none"
        style={{ stroke: 'var(--ink)', strokeWidth: TRACK_WIDTH, strokeLinecap: 'round', strokeLinejoin: 'round' }}
      />
    </svg>
  );
}

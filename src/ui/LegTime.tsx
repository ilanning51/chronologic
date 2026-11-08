import { formatSeconds } from '../plane/grid';

interface LegTimeProps {
  /** The screen point of the stop the leg arrives at. */
  x: number;
  y: number;
  /** The planned time of the leg into the stop, from the point before it. */
  seconds: number;
  /** How long from now until the train reaches the stop, when the stop is one being dragged. */
  until?: number;
}

/** How far each chip hangs from the stop's point: clear of the shape and its label. */
const DROP_PX = 40;

/**
 * The times of the point being set, shown only while a finger holds it: above it, the leg from
 * the point before; beneath it, for a stop, how long from now until its train gets there.
 */
export function LegTime({ x, y, seconds, until }: LegTimeProps) {
  return (
    <>
      <span className="leg-time" aria-live="polite" style={{ left: x, top: y - DROP_PX }}>
        {formatSeconds(seconds)}
      </span>
      {until !== undefined && (
        <span className="leg-time until" aria-live="polite" style={{ left: x, top: y + DROP_PX }}>
          {formatSeconds(until)}
        </span>
      )}
    </>
  );
}

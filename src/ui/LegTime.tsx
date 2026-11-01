import { formatSeconds } from '../plane/grid';

interface LegTimeProps {
  /** The screen point of the stop the leg arrives at. */
  x: number;
  y: number;
  seconds: number;
}

/** How far it hangs beneath the stop's point: clear of the shape and its label. */
const DROP_PX = 40;

/** The planned time of the leg being set, shown beneath its stop only while a finger holds it. */
export function LegTime({ x, y, seconds }: LegTimeProps) {
  return (
    <span className="leg-time" aria-live="polite" style={{ left: x, top: y + DROP_PX }}>
      {formatSeconds(seconds)}
    </span>
  );
}

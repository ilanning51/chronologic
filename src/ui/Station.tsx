import { SIZE_WORDS } from '../model/kinds';
import type { Station as StationData } from '../model/types';
import { labelFontPx } from '../plane/labels';

interface StationProps {
  station: StationData;
  /** The camera scale, which decides the label's size and whether it shows. */
  scale: number;
  /** Whether this is the next pending station on the running line. */
  next?: boolean;
}

/** One task on the plane: a solid shape for its size, a dot once done, a label beneath. */
export function Station({ station, scale, next = false }: StationProps) {
  const label = labelFontPx(scale);
  const name = [station.title, SIZE_WORDS[station.shape], station.done ? 'done' : null, next ? 'next' : null]
    .filter(Boolean)
    .join(', ');
  return (
    <button
      type="button"
      className={station.done ? 'station done' : 'station'}
      data-target="station"
      data-id={station.id}
      aria-label={name}
      style={{ left: station.x, top: station.y }}
    >
      <span aria-hidden="true" className={`shape ${station.done ? 'dot' : station.shape}`} />
      {label !== null && (
        <span className="label" style={{ fontSize: label / scale }}>
          {station.title}
        </span>
      )}
    </button>
  );
}

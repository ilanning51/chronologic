import type { Tile } from '../plane/gestures';

interface TrayProps {
  open: boolean;
  /** The brush that is on, if any: its tile shows pressed. */
  brush: Tile | null;
  onToggle: () => void;
  /** A tile chosen from the keyboard. A pointer's tap reaches the app through the plane instead. */
  onBrushKey: (tile: Tile) => void;
}

const TILES: { tile: Tile; label: string }[] = [
  { tile: 'circle', label: 'Step' },
  { tile: 'triangle', label: 'Sub-goal' },
  { tile: 'line', label: 'New line' },
  { tile: 'sun', label: 'Today' },
];

/** Each tile's picture, drawn in currentColor so the pressed tile can turn it ink. */
function Picture({ tile }: { tile: Tile }) {
  switch (tile) {
    case 'circle':
    case 'triangle':
      return <span aria-hidden="true" className={`shape ${tile} medium`} />;
    case 'line':
      // A line as it looks on the plane: a round start, a short run, a square goal.
      return (
        <svg aria-hidden="true" width="26" height="22" viewBox="0 0 26 22">
          <path d="M4 11h11" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
          <rect x="14" y="5.5" width="11" height="11" fill="currentColor" />
        </svg>
      );
    case 'sun':
      return (
        <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="5" fill="currentColor" />
          <path
            d="M12 1v3M12 20v3M1 12h3M20 12h3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      );
  }
}

/**
 * The plus button and, when open, the tray beside it: a step, a sub-goal, a new line and the
 * sun that draws today. Each tile is a brush: a tap turns it on or off, and a tile can still be
 * dragged out onto the plane. The plane's recognizer reports the tap, so a pointer's click is
 * ignored here; a click from the keyboard (detail 0) has no tap behind it and toggles. The plus
 * toggles through a plain click so the keyboard reaches it too.
 */
export function Tray({ open, brush, onToggle, onBrushKey }: TrayProps) {
  return (
    <>
      {open && (
        <div className="hud-tray" data-target="hud" role="group" aria-label="Add tray">
          {TILES.map(({ tile, label }) => (
            <button
              key={tile}
              type="button"
              className="tile"
              data-target="tile"
              data-tile={tile}
              aria-label={label}
              aria-pressed={brush === tile}
              onClick={(e) => {
                if (e.detail === 0) onBrushKey(tile);
              }}
            >
              <Picture tile={tile} />
            </button>
          ))}
        </div>
      )}
      <button type="button" className="hud-add" data-target="hud" aria-label="Add" aria-expanded={open} onClick={onToggle}>
        <svg aria-hidden="true" width="22" height="22" viewBox="0 0 22 22">
          <path d="M11 2v18M2 11h18" style={{ stroke: 'var(--paper)' }} strokeWidth="3.5" strokeLinecap="round" fill="none" />
        </svg>
      </button>
    </>
  );
}

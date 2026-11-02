interface TrayProps {
  open: boolean;
  onToggle: () => void;
}

/**
 * The plus button and, when open, the tray beside it: a step, a sub-goal, a new line and the
 * sun that draws today. The tiles are dragged (or, for the line, tapped) by the plane's recognizer, so they only carry
 * data attributes; the plus toggles through a plain click so the keyboard reaches it too.
 */
export function Tray({ open, onToggle }: TrayProps) {
  return (
    <>
      {open && (
        <div className="hud-tray" data-target="hud" role="group" aria-label="Add tray">
          <button type="button" className="tile" data-target="tile" data-tile="circle" aria-label="Step">
            <span aria-hidden="true" className="shape circle medium" />
          </button>
          <button type="button" className="tile" data-target="tile" data-tile="triangle" aria-label="Sub-goal">
            <span aria-hidden="true" className="shape triangle medium" />
          </button>
          <button type="button" className="tile" data-target="tile" data-tile="line" aria-label="New line">
            <svg aria-hidden="true" width="26" height="22" viewBox="0 0 26 22">
              <rect x="1" y="5" width="12" height="12" style={{ fill: 'var(--paper)' }} />
              <rect x="15" y="8" width="10" height="6" rx="2" style={{ fill: 'var(--paper)' }} />
            </svg>
          </button>
          <button type="button" className="tile" data-target="tile" data-tile="sun" aria-label="Today">
            <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="5" style={{ fill: 'var(--paper)' }} />
              <path
                d="M12 1v3M12 20v3M1 12h3M20 12h3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"
                style={{ stroke: 'var(--paper)' }}
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
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

interface HistoryProps {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

/** The U-turn arrow of the system's Undo symbol (arrow.uturn.backward); Redo is it mirrored. */
function Arrow({ flip }: { flip?: boolean }) {
  return (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20" style={flip ? { transform: 'scaleX(-1)' } : undefined}>
      <path
        d="M7 4L3 8l4 4M3 8h9a5 5 0 0 1 0 10H9"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

/**
 * Undo and Redo, top left, as one toolbar group on glass. Plain clicks, so the keyboard reaches
 * them; the plane's recognizer reads them as HUD and leaves them alone. Hovering names the
 * shortcut, the way a desktop toolbar's tooltip does.
 */
export function History({ canUndo, canRedo, onUndo, onRedo }: HistoryProps) {
  return (
    <div className="hud-history" data-target="hud" role="group" aria-label="History">
      <button type="button" className="hud-segment" aria-label="Undo" title="Undo (Ctrl+Z)" disabled={!canUndo} onClick={onUndo}>
        <Arrow />
      </button>
      <button type="button" className="hud-segment" aria-label="Redo" title="Redo (Ctrl+Shift+Z)" disabled={!canRedo} onClick={onRedo}>
        <Arrow flip />
      </button>
    </div>
  );
}

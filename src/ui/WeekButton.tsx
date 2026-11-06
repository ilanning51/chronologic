interface WeekButtonProps {
  open: boolean;
  onToggle: () => void;
}

/** The round ink button above the plus that opens and closes the week window. */
export function WeekButton({ open, onToggle }: WeekButtonProps) {
  return (
    <button type="button" className="hud-week" aria-label="Week" aria-expanded={open} onClick={onToggle}>
      <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ stroke: 'var(--paper)' }}>
        <rect x="3" y="5" width="18" height="16" rx="2.5" strokeWidth="2.5" />
        <path d="M3 10.5h18M8 2.5v4M16 2.5v4" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    </button>
  );
}

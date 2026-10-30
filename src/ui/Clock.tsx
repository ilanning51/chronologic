interface ClockProps {
  /** How much of the stretch is left, 0 to 1. */
  fraction: number;
  /** The line's color as the theme writes it. */
  color: string;
}

/** A solid pie that is eaten as the stretch elapses. It carries no digits, ever. */
export function Clock({ fraction, color }: ClockProps) {
  const percent = Math.round(fraction * 1000) / 10;
  return (
    <button
      type="button"
      className="hud-clock"
      data-target="clock"
      aria-label="Stretch clock. Tap to find the train, hold to end the stretch."
    >
      <span
        aria-hidden="true"
        className="pie"
        style={{ background: `conic-gradient(${color} 0 ${percent}%, var(--paper) ${percent}% 100%)` }}
      />
    </button>
  );
}

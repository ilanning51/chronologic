import type { CSSProperties } from 'react';

interface ClockProps {
  /** How much of the stretch is left, 0 to 1. */
  fraction: number;
  /** The line's color as the theme writes it. */
  color: string;
  /** Whether a finger is holding the clock; the pie shrinks while it does. */
  holding: boolean;
  /** Keyboard activation only; touch goes through the plane's recognizer. */
  onActivate?: () => void;
}

/** A solid pie that is eaten as the stretch elapses. It carries no digits, ever. */
export function Clock({ fraction, color, holding, onActivate }: ClockProps) {
  const percent = Math.round(fraction * 1000) / 10;
  const pie = { ['--pie']: `conic-gradient(${color} 0 ${percent}%, var(--paper) ${percent}% 100%)` } as CSSProperties;
  return (
    <button
      type="button"
      className={holding ? 'hud-clock holding' : 'hud-clock'}
      data-target="clock"
      aria-label="Stretch clock. Tap to find the train, hold to end the stretch."
      onClick={(e) => {
        if (e.detail === 0) onActivate?.();
      }}
    >
      <span aria-hidden="true" className="pie" style={pie} />
    </button>
  );
}

/**
 * The time grid: squares on the paper that give a length its meaning. Each square is one
 * unit from a ladder of nice durations. As the camera zooms in, a square grows until the
 * next unit down fits at GRID_MIN_PX, and the grid steps to it; zooming out does the reverse.
 * Only the unit changes with zoom, never the ladder, so a square always reads as a round time.
 */

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

/** The ladder, smallest first. Each is a round duration a person would estimate in. */
export const UNITS: { seconds: number; label: string }[] = [
  { seconds: 1, label: '1 second' },
  { seconds: 5, label: '5 seconds' },
  { seconds: 15, label: '15 seconds' },
  { seconds: MINUTE, label: '1 minute' },
  { seconds: 5 * MINUTE, label: '5 minutes' },
  { seconds: 15 * MINUTE, label: '15 minutes' },
  { seconds: HOUR, label: '1 hour' },
  { seconds: 6 * HOUR, label: '6 hours' },
  { seconds: DAY, label: '1 day' },
  { seconds: WEEK, label: '1 week' },
  { seconds: 30 * DAY, label: '30 days' },
];

/** The narrowest a square gets before the grid steps up a unit. */
export const GRID_MIN_PX = 20;

export interface Grid {
  /** How long one square stands for. */
  seconds: number;
  /** How wide it is on screen. */
  px: number;
  /** The unit's name for the legend. */
  label: string;
}

/** The grid for a camera scale (screen pixels per second of plan). */
export function gridFor(scale: number): Grid {
  const unit = UNITS.find((u) => u.seconds * scale >= GRID_MIN_PX) ?? UNITS[UNITS.length - 1];
  return { seconds: unit.seconds, px: unit.seconds * scale, label: unit.label };
}

const PARTS: { seconds: number; suffix: string }[] = [
  { seconds: WEEK, suffix: 'w' },
  { seconds: DAY, suffix: 'd' },
  { seconds: HOUR, suffix: 'h' },
  { seconds: MINUTE, suffix: 'min' },
  { seconds: 1, suffix: 's' },
];

/**
 * A duration as a person would say it: its largest unit and the next one down, whole numbers
 * only, like "2 h 15 min". A second unit that rounds to nothing is left out.
 */
export function formatSeconds(seconds: number): string {
  const whole = Math.floor(seconds);
  const i = PARTS.findIndex((p) => whole >= p.seconds);
  if (i < 0) return '0 s';
  const big = Math.floor(whole / PARTS[i].seconds);
  const words = [`${big} ${PARTS[i].suffix}`];
  const next = PARTS[i + 1];
  if (next) {
    const small = Math.floor((whole - big * PARTS[i].seconds) / next.seconds);
    if (small > 0) words.push(`${small} ${next.suffix}`);
  }
  return words.join(' ');
}

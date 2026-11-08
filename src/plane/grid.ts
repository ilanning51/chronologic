/**
 * The time grid: squares on the paper that give a length its meaning. Each square is one
 * unit from a ladder of nice durations. As the camera zooms in, a square grows until the
 * next unit down fits at GRID_MIN_PX, and the grid steps to it; zooming out does the reverse.
 * Only the unit changes with zoom, never the ladder, so a square always reads as a round time.
 */

export const MINUTE = 60;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;
export const WEEK = 7 * DAY;
/** A month and a year as the ladder and the leg chip count them: 30 days and 365 days. */
export const MONTH = 30 * DAY;
export const YEAR = 365 * DAY;

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
  { seconds: MONTH, label: '30 days' },
  { seconds: 3 * MONTH, label: '3 months' },
  { seconds: YEAR, label: '1 year' },
  { seconds: 5 * YEAR, label: '5 years' },
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
  { seconds: YEAR, suffix: 'y' },
  { seconds: MONTH, suffix: 'mo' },
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

/** The words a typed duration may use for each unit, the chip's own suffixes among them. */
const WORDS: Record<string, number> = {
  s: 1, sec: 1, secs: 1, second: 1, seconds: 1,
  m: MINUTE, min: MINUTE, mins: MINUTE, minute: MINUTE, minutes: MINUTE,
  h: HOUR, hr: HOUR, hrs: HOUR, hour: HOUR, hours: HOUR,
  d: DAY, day: DAY, days: DAY,
  w: WEEK, wk: WEEK, wks: WEEK, week: WEEK, weeks: WEEK,
  mo: MONTH, mos: MONTH, month: MONTH, months: MONTH,
  y: YEAR, yr: YEAR, yrs: YEAR, year: YEAR, years: YEAR,
};

/**
 * A duration typed the way a person writes it, back into seconds: number-and-unit pairs such as
 * "2 h 15 min", "1d 4h" or "1.5 h", with any spacing. A bare number is minutes, the unit a single
 * step is most often thought of in. Anything else, or a duration of nothing, gives null.
 */
export function parseSeconds(text: string): number | null {
  const s = text.trim().toLowerCase();
  if (s === '') return null;
  if (/^\d+(\.\d+)?$/.test(s)) {
    const minutes = Number(s) * MINUTE;
    return minutes > 0 ? Math.round(minutes) : null;
  }
  const pair = /(\d+(?:\.\d+)?)\s*([a-z]+)\s*/g;
  let total = 0;
  let at = 0;
  for (let m = pair.exec(s); m !== null; m = pair.exec(s)) {
    const unit = WORDS[m[2]];
    if (m.index !== at || unit === undefined) return null;
    total += Number(m[1]) * unit;
    at = pair.lastIndex;
  }
  if (at !== s.length || total <= 0) return null;
  return Math.round(total);
}

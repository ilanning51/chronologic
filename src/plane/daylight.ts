/**
 * The paper knows what time it is. Its flat colour drifts through the day: the warm grey of the
 * design by day, cooler and a shade darker at night, bluish at dawn and peach at dusk. A cue for
 * a brain that cannot feel time pass, read without a clock. Flat tints only: one colour on the
 * whole paper at a time, never a gradient. Every colour that sits on the paper (ink, muted, the
 * eight track colours) was measured against the day paper and keeps its contrast on each of these.
 */

/** The paper at each keyframe hour; between two it is mixed in proportion. The last wraps to the first. */
export const PAPER_BY_HOUR: readonly { hour: number; paper: string }[] = [
  { hour: 0, paper: '#E4E3E7' }, // night
  { hour: 5, paper: '#E4E3E7' },
  { hour: 7, paper: '#E7ECEE' }, // dawn, cool
  { hour: 10, paper: '#EEEBE5' }, // day, the design's paper
  { hour: 16, paper: '#EEEBE5' },
  { hour: 19, paper: '#F1E5D3' }, // dusk, warm
  { hour: 22, paper: '#E4E3E7' }, // night
  { hour: 24, paper: '#E4E3E7' },
];

/** The design's day paper and its grid: the grid is this much darker in every channel. */
export const DAY_PAPER = '#EEEBE5';
const GRID_STEP = [14, 15, 16] as const;

function parse(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

function format(rgb: readonly number[]): string {
  return '#' + rgb.map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, '0').toUpperCase()).join('');
}

/** The paper colour at this hour of the day (0 to 24, fractions for minutes). */
export function paperAt(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  for (let i = 1; i < PAPER_BY_HOUR.length; i++) {
    const a = PAPER_BY_HOUR[i - 1];
    const b = PAPER_BY_HOUR[i];
    if (h <= b.hour) {
      const t = b.hour === a.hour ? 0 : (h - a.hour) / (b.hour - a.hour);
      const from = parse(a.paper);
      const to = parse(b.paper);
      return format(from.map((c, k) => c + (to[k] - c) * t));
    }
  }
  return PAPER_BY_HOUR[PAPER_BY_HOUR.length - 1].paper;
}

/** The grid's hairline colour for a paper: a shade off it, so a square is seen and never read. */
export function gridTint(paper: string): string {
  return format(parse(paper).map((c, k) => c - GRID_STEP[k]));
}

/** The hour of the day, with minutes as a fraction, in local time. */
export function hourOf(date: Date): number {
  return date.getHours() + date.getMinutes() / 60;
}

/** Writes the paper and grid for this moment onto the root, where the tokens read them. */
export function applyDaylight(root: { style: { setProperty(name: string, value: string): void } }, date: Date): void {
  const paper = paperAt(hourOf(date));
  root.style.setProperty('--paper', paper);
  root.style.setProperty('--grid', gridTint(paper));
}

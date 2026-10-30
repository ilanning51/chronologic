import { LENGTH_MINUTES } from './sizes';
import type { Stretch } from './types';

const MINUTE_MS = 60_000;

/** The name a stretch gets before you type over it, from the hour it started. */
export function defaultName(hour: number): 'Morning' | 'Afternoon' | 'Evening' {
  if (hour < 12) return 'Morning';
  if (hour < 18) return 'Afternoon';
  return 'Evening';
}

/**
 * The fraction of the stretch still to come, read from the start timestamp and the
 * clock rather than counted in ticks, so sleeping through the end still ends it.
 */
export function remaining(stretch: Stretch, now: number): number {
  const total = LENGTH_MINUTES[stretch.length] * MINUTE_MS;
  const elapsed = now - stretch.startedAt;
  return Math.min(1, Math.max(0, 1 - elapsed / total));
}

export function isOver(stretch: Stretch, now: number): boolean {
  return remaining(stretch, now) === 0;
}

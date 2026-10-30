import { SHAPE_MINUTES } from './sizes';
import type { Station } from './types';

export interface Fit {
  /** Ids the color reaches, in line order. */
  reached: string[];
  /** Ids beyond the terminus, in line order. They stand on bare paper. */
  beyond: string[];
  /** Minutes the reached stations cost. */
  spent: number;
}

/**
 * Spends the line's color in order. A station fits when the running total up to and
 * including it is at most the capacity; the first that does not fit, and everything
 * after it, is beyond. Done stations cost their size like any other.
 */
export function fit(order: Station[], cap: number): Fit {
  const reached: string[] = [];
  const beyond: string[] = [];
  let spent = 0;
  for (const station of order) {
    const cost = SHAPE_MINUTES[station.shape];
    if (beyond.length === 0 && spent + cost <= cap) {
      reached.push(station.id);
      spent += cost;
    } else {
      beyond.push(station.id);
    }
  }
  return { reached, beyond, spent };
}

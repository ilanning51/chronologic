import { V } from '../model/motion';

/**
 * How often, in milliseconds, the clock needs to tick for the train to move about a pixel
 * at cruise speed: fast when zoomed in, a minute at most when zoomed far out, never faster
 * than 16 ms (a frame).
 */
export function tickMsFor(scale: number): number {
  return Math.min(60_000, Math.max(16, 1000 / (V * scale)));
}

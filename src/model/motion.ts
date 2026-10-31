/** Share of a leg's time spent accelerating, and again spent braking. The middle three fifths cruise. */
export const F = 0.2;

/** Top speed during the cruise, as a multiple of the leg's average speed. */
export const V = 1.25;

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

/**
 * Maps the fraction of a leg's time that has passed (tau) to the fraction of its distance
 * covered (p). Accelerates for the first F of the time, cruises at V through the middle,
 * and brakes over the last F. Input and output are clamped to [0, 1].
 */
export function progress(tau: number): number {
  const t = clamp01(tau);
  if (t < F) return (V * t * t) / (2 * F);
  if (t <= 1 - F) return V * (t - F / 2);
  return 1 - (V * (1 - t) * (1 - t)) / (2 * F);
}

/**
 * The exact inverse of progress: the fraction of a leg's time at which the train has covered
 * the fraction p of its distance. Input and output are clamped to [0, 1].
 */
export function invertProgress(p: number): number {
  const d = clamp01(p);
  if (d < (V * F) / 2) return Math.sqrt((2 * F * d) / V);
  if (d > 1 - (V * F) / 2) return 1 - Math.sqrt((2 * F * (1 - d)) / V);
  return d / V + F / 2;
}

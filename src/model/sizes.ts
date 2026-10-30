import type { Length, Shape } from './types';

/** The rough minutes each shape stands for. The app keeps these to itself. */
export const SHAPE_MINUTES: Record<Shape, number> = {
  circle: 20,
  triangle: 45,
  square: 90,
};

export const LENGTH_MINUTES: Record<Length, number> = {
  hour: 60,
  couple: 120,
  half: 240,
  whole: 480,
};

export const LENGTH_WORDS: Record<Length, string> = {
  hour: 'an hour',
  couple: 'a couple of hours',
  half: 'half a day',
  whole: 'the whole day',
};

/** The order the length chips sit in, shortest first. */
export const LENGTH_ORDER: Length[] = ['hour', 'couple', 'half', 'whole'];

/** Every planner over-packs, so the app absorbs it: a stretch holds this much of its length. */
export const CAPACITY_RATIO = 0.8;

/** Minutes of stations a stretch of this length holds. */
export function capacity(length: Length): number {
  return LENGTH_MINUTES[length] * CAPACITY_RATIO;
}

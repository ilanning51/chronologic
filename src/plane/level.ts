import type { Shape, Size } from '../model/types';
import { DAY, HOUR, MINUTE, WEEK } from './grid';

/**
 * Which stops the map shows at a height. Like a map that draws cities from far away and
 * streets only up close, each shape and size has a grid unit, and it is drawn only when the
 * grid is at that unit or a smaller one. The grid is the one idea of "level" the app has, so a
 * shape appears at the same moment the legend steps down. The square and the large triangle
 * are always drawn; the next stop and the goal are kept by the layout whatever their shape.
 */

/** The widest grid unit, in seconds, at which each shape and size is drawn. */
export const LEVELS: Record<Shape, Record<Size, number>> = {
  square: { small: Infinity, medium: Infinity, large: Infinity },
  triangle: { small: DAY, medium: WEEK, large: Infinity },
  circle: { small: 15 * MINUTE, medium: HOUR, large: 6 * HOUR },
};

/** Whether a stop of this shape and size is drawn when one grid square is `gridSeconds`. */
export function showsAt(shape: Shape, size: Size, gridSeconds: number): boolean {
  return gridSeconds <= LEVELS[shape][size];
}

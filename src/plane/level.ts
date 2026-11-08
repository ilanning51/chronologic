import type { Shape, Size } from '../model/types';
import { DAY, GRID_MIN_PX, HOUR, MINUTE, MONTH, WEEK, YEAR } from './grid';

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

/**
 * By line rather than by shape: from this grid unit up, project lines and everything on them are
 * left out and only the life line is drawn, the way a far-out map keeps only the coast.
 */
export const PROJECTS_HIDDEN_FROM = 90 * DAY;

/** From this grid unit up, the life line also leaves out its rings; bare markers and done squares stay. */
export const RINGS_HIDDEN_FROM = YEAR;

/**
 * The widest zoom at which a project line is still drawn: the 30-day unit just fits. Framing a
 * project never goes wider, or a years-long leg would open on a view with nothing of it in sight.
 */
export const PROJECT_MIN_SCALE = GRID_MIN_PX / MONTH;

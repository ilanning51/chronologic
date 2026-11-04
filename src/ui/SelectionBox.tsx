import type { Rect } from '../plane/select';

interface SelectionBoxProps {
  /** Where the box is drawn, in screen pixels. */
  rect: Rect;
  /** Still being drawn under the mouse: it takes no pointer events. Kept: it is a drag target. */
  live: boolean;
}

/**
 * The box: a tool in the hand, not a part of the map. While live it follows the mouse from
 * where the button went down; let go, it sits snug around what it caught and drags all of it.
 */
export function SelectionBox({ rect, live }: SelectionBoxProps) {
  return (
    <div
      aria-hidden="true"
      className={live ? 'selection-box live' : 'selection-box'}
      data-target={live ? undefined : 'selection'}
      style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
    />
  );
}

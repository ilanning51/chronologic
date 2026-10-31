import { LABEL_ROOM_PX } from './world';

/**
 * Which stops get a label: the `always` ones first, then each other stop from left to right
 * unless a label already shown sits within LABEL_ROOM_PX of it. Crowded stops go unlabeled
 * rather than overlap.
 */
export function labelsWithRoom(stops: { id: string; x: number }[], always: Set<string>): Set<string> {
  const sorted = [...stops].sort((a, b) => a.x - b.x);
  const shown = new Set(sorted.filter((s) => always.has(s.id)).map((s) => s.id));
  const shownX = sorted.filter((s) => shown.has(s.id)).map((s) => s.x);
  for (const s of sorted) {
    if (shown.has(s.id)) continue;
    if (shownX.some((x) => Math.abs(x - s.x) < LABEL_ROOM_PX)) continue;
    shown.add(s.id);
    shownX.push(s.x);
  }
  return shown;
}

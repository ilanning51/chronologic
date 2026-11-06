import { expect, test } from 'vitest';
import { LABEL_GAP_PX, LABEL_LEAD_PX, labelsWithRoom, placeLabels, textWidth, wrapName } from './labels';

test('labels go left to right, always-ids first, and a label needs 80 px of room', () => {
  const stops = [
    { id: 'c', x: 150 },
    { id: 'a', x: 0 },
    { id: 'b', x: 50 },
    { id: 'd', x: 160 },
  ];
  // 'd' is always shown, so 'c' (10 px away) loses; 'b' is 50 from 'a', so it loses; 'a' stays.
  expect([...labelsWithRoom(stops, new Set(['d']))].sort()).toEqual(['a', 'd']);
  // With nothing forced: a (0), b too close, c (150) fits, d too close to c.
  expect([...labelsWithRoom(stops, new Set())].sort()).toEqual(['a', 'c']);
  // Exactly 80 px apart is room enough.
  expect([...labelsWithRoom([{ id: 'p', x: 0 }, { id: 'q', x: 80 }], new Set())].sort()).toEqual(['p', 'q']);
});

test('an always-id that is not in the list is ignored', () => {
  expect([...labelsWithRoom([{ id: 'a', x: 0 }], new Set(['ghost']))]).toEqual(['a']);
});

const mark = { left: -7, top: -7, right: 7, bottom: 7 };
const item = (id: string, x: number, y: number, text = 'Library', always = false) => ({ id, x, y, mark, text, bold: false, always });

test('a name beside a vertical line is set right of its station, its first line centred on it', () => {
  const places = placeLabels([item('a', 100, 100)], [[{ x: 100, y: 0 }, { x: 100, y: 200 }]], []);
  expect(places.get('a')).toEqual({ side: 'right', lines: ['Library'], dx: 7 + LABEL_GAP_PX, dy: -LABEL_LEAD_PX / 2 });
});

test('a name on a horizontal line is set below or above it, never on it', () => {
  const places = placeLabels([item('a', 100, 100)], [[{ x: 0, y: 100 }, { x: 300, y: 100 }]], []);
  expect(places.get('a')!.side).toBe('below');
  expect(places.get('a')!.dy).toBe(7 + LABEL_GAP_PX);
});

test('the end of a line takes its name past the end, where the line is not', () => {
  // The line comes in from the right and ends here.
  const places = placeLabels([item('a', 100, 100)], [[{ x: 300, y: 100 }, { x: 100, y: 100 }]], []);
  expect(places.get('a')!.side).toBe('left');
});

test('a name keeps clear of another station, and of a name already set', () => {
  const vertical: [{ x: number; y: number }, { x: number; y: number }][] = [[{ x: 100, y: 0 }, { x: 100, y: 400 }]];
  // A station just right of a: its name goes left instead.
  expect(placeLabels([item('a', 100, 100)], vertical, [{ id: 'b', x: 130, y: 100, r: 7 }]).get('a')!.side).toBe('left');
  // Two stations on one line close together: the second name does not land on the first.
  const both = placeLabels([item('a', 100, 100), item('c', 100, 108)], vertical, []);
  expect(both.get('a')!.side).toBe('right');
  expect(both.get('c')!.side).not.toBe('right');
});

test('a name with no clear side is left out; a next stop or a goal may cover a station, and is set first', () => {
  // Stations packed close on every side of a, as when zoomed far out.
  const around = [
    { id: 'n', x: 100, y: 80, r: 7 },
    { id: 's', x: 100, y: 120, r: 7 },
    { id: 'e', x: 125, y: 100, r: 7 },
    { id: 'w', x: 75, y: 100, r: 7 },
  ];
  expect(placeLabels([item('a', 100, 100)], [], around).has('a')).toBe(false);
  expect(placeLabels([item('a', 100, 100, 'Library', true)], [], around).has('a')).toBe(true);
  // An always-set name goes first, so where two names want one place, the other gives way.
  const vertical: [{ x: number; y: number }, { x: number; y: number }][] = [[{ x: 100, y: 0 }, { x: 100, y: 400 }]];
  const pair = placeLabels([item('a', 100, 100), item('b', 100, 104, 'Library', true)], vertical, []);
  expect(pair.get('b')!.side).toBe('right');
  expect(pair.get('a')?.side).not.toBe('right');
  // But no name is set on another, whoever's it is.
  const crowd = placeLabels([item('a', 100, 100, 'Library', true), item('b', 100, 100.5, 'Library', true)], [], []);
  expect(crowd.size).toBe(2);
  const boxes = [...crowd.values()].map((p) => p.side);
  expect(new Set(boxes).size).toBe(2);
});

test('a long name of several words breaks onto two lines at its most even space; a short one stays whole', () => {
  expect(wrapName('Library', false)).toEqual(['Library']);
  expect(wrapName('Read chapter three of the book', false)).toEqual(['Read chapter', 'three of the book']);
  // A goal is set in capitals, so it is measured in capitals.
  expect(textWidth('essay', true)).toBeCloseTo(textWidth('ESSAY', true));
  expect(textWidth('essay', true)).toBeGreaterThan(textWidth('essay', false));
});

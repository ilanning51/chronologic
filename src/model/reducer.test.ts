import { expect, test } from 'vitest';
import { EMPTY, reduce, type Action } from './reducer';
import type { Kind, Shape, Station, World } from './types';

const station = (id: string, shape: Shape, x = 0, done = false): Station => ({ id, title: id, shape, x, y: 0, z: 0, done });

const world = (...stations: Station[]): World => ({ ...EMPTY, stations });

const run = (w: World, ...actions: Action[]) => actions.reduce(reduce, w);

const start = (line: string[], kind: Kind = 'deep'): Action => ({
  type: 'start',
  kind,
  length: 'couple',
  line,
  now: 5_000,
  hour: 15,
});

test('add, move, edit, delete', () => {
  let w = reduce(EMPTY, { type: 'add', id: 'a', title: 'Dentist', shape: 'circle', x: 10, y: 20 });
  expect(w.stations).toEqual([{ id: 'a', title: 'Dentist', shape: 'circle', x: 10, y: 20, z: 0, done: false }]);
  w = reduce(w, { type: 'move', id: 'a', x: 30, y: 40 });
  expect(w.stations[0]).toMatchObject({ x: 30, y: 40 });
  w = reduce(w, { type: 'edit', id: 'a', shape: 'square' });
  expect(w.stations[0]).toMatchObject({ title: 'Dentist', shape: 'square' });
  w = reduce(w, { type: 'edit', id: 'a', title: 'Book the dentist' });
  expect(w.stations[0]).toMatchObject({ title: 'Book the dentist', shape: 'square' });
  w = reduce(w, { type: 'delete', id: 'a' });
  expect(w.stations).toEqual([]);
});

test('unknown ids are ignored', () => {
  const w = world(station('a', 'circle'));
  expect(reduce(w, { type: 'move', id: 'zz', x: 1, y: 1 })).toEqual(w);
  expect(reduce(w, { type: 'complete', id: 'zz' })).toEqual(w);
  expect(reduce(w, { type: 'delete', id: 'zz' })).toEqual(w);
});

test('start fits the line and names the stretch', () => {
  const w = run(world(station('a', 'circle'), station('b', 'triangle'), station('c', 'square')), start(['a', 'b', 'c']));
  expect(w.stretch).toEqual({ kind: 'deep', length: 'couple', name: 'Afternoon', startedAt: 5_000, line: ['a', 'b', 'c'] });
  expect(w.lastLength).toBe('couple');
});

test('start with an empty or unknown line is ignored', () => {
  const w = world(station('a', 'circle'));
  expect(reduce(w, start([])).stretch).toBeNull();
  expect(reduce(w, start(['nope'])).stretch).toBeNull();
});

test('a line never holds the same station twice', () => {
  const w = run(world(station('a', 'circle'), station('b', 'circle')), start(['a', 'a', 'b', 'a']));
  expect(w.stretch?.line).toEqual(['a', 'b']);
});

test('complete only works on the line, restore works anywhere', () => {
  let w = run(world(station('a', 'circle'), station('b', 'circle'), station('off', 'circle')), start(['a', 'b']));
  expect(reduce(w, { type: 'complete', id: 'off' })).toEqual(w);
  w = reduce(w, { type: 'complete', id: 'a' });
  expect(w.stations.find((s) => s.id === 'a')?.done).toBe(true);
  expect(w.stretch).not.toBeNull();
  w = reduce(w, { type: 'restore', id: 'a' });
  expect(w.stations.find((s) => s.id === 'a')?.done).toBe(false);
});

test('completing the last pending station ends the stretch', () => {
  const w = run(
    world(station('a', 'circle'), station('b', 'circle')),
    start(['a', 'b']),
    { type: 'complete', id: 'a' },
    { type: 'complete', id: 'b' },
  );
  expect(w.stretch).toBeNull();
  expect(w.stations.every((s) => s.done)).toBe(true);
});

test('split replaces a square with four circles in the line', () => {
  const q: Station = { id: 'q', title: 'Taxes', shape: 'square', x: 100, y: 50, z: 0, done: false };
  let w = run(world(station('p', 'circle'), q, station('r', 'circle')), start(['p', 'q', 'r']));
  w = reduce(w, { type: 'split', id: 'q', ids: ['q1', 'q2', 'q3', 'q4'] });
  const pieces = w.stations.filter((s) => s.id.startsWith('q'));
  expect(pieces.map((s) => [s.id, s.title, s.shape, s.x, s.y])).toEqual([
    ['q1', 'Taxes 1', 'circle', 100, 50],
    ['q2', 'Taxes 2', 'circle', 148, 50],
    ['q3', 'Taxes 3', 'circle', 196, 50],
    ['q4', 'Taxes 4', 'circle', 244, 50],
  ]);
  expect(w.stretch?.line).toEqual(['p', 'q1', 'q2', 'q3', 'q4', 'r']);
});

test('split needs the right number of ids', () => {
  const w = world(station('t', 'triangle'));
  expect(reduce(w, { type: 'split', id: 't', ids: ['x'] })).toEqual(w);
  expect(reduce(w, { type: 'split', id: 't', ids: ['x', 'y'] }).stations.map((s) => s.id)).toEqual(['x', 'y']);
});

test('end slides pending line stations to the front and keeps done ones', () => {
  const w = run(
    world(station('k', 'circle', 100), station('a', 'circle', 300), station('b', 'circle', 500), station('c', 'circle', 700)),
    start(['a', 'b', 'c']),
    { type: 'complete', id: 'a' },
    { type: 'end' },
  );
  expect(w.stretch).toBeNull();
  const by = (id: string) => w.stations.find((s) => s.id === id)!;
  expect(by('a')).toMatchObject({ x: 300, done: true });
  expect(by('b').x).toBeLessThan(by('k').x);
  expect(by('c').x).toBeLessThan(by('k').x);
  expect(by('b').x).toBeLessThan(by('c').x);
});

test('end with nothing pending changes no positions', () => {
  const before = run(world(station('a', 'circle', 300)), start(['a']), { type: 'complete', id: 'a' });
  expect(before.stretch).toBeNull();
  const w = reduce(before, { type: 'end' });
  expect(w.stations).toEqual(before.stations);
});

test('redraw keeps the start time and replaces the line and kind', () => {
  let w = run(world(station('a', 'circle'), station('b', 'circle')), start(['a']));
  w = reduce(w, { type: 'redraw', kind: 'body', line: ['b', 'a'] });
  expect(w.stretch).toMatchObject({ kind: 'body', length: 'couple', name: 'Afternoon', startedAt: 5_000, line: ['b', 'a'] });
  expect(reduce(w, { type: 'redraw', kind: 'out', line: [] })).toEqual(w);
  expect(reduce(EMPTY, { type: 'redraw', kind: 'out', line: ['a'] })).toEqual(EMPTY);
});

test('delete removes a station from the line', () => {
  const w = run(world(station('a', 'circle'), station('b', 'circle')), start(['a', 'b']), { type: 'delete', id: 'a' });
  expect(w.stretch?.line).toEqual(['b']);
});

test('rename changes the name only', () => {
  const w = run(world(station('a', 'circle')), start(['a']), { type: 'rename', name: 'Writing' });
  expect(w.stretch?.name).toBe('Writing');
  expect(reduce(EMPTY, { type: 'rename', name: 'x' })).toEqual(EMPTY);
});

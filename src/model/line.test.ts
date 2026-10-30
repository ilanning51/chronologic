import { expect, test } from 'vitest';
import { fit } from './line';
import type { Shape, Station } from './types';

const s = (id: string, shape: Shape, done = false): Station => ({ id, title: id, shape, x: 0, y: 0, z: 0, done });

test('the color runs out at capacity', () => {
  const r = fit([s('a', 'circle'), s('b', 'triangle'), s('c', 'square'), s('d', 'circle'), s('e', 'circle')], 96);
  expect(r.reached).toEqual(['a', 'b']);
  expect(r.beyond).toEqual(['c', 'd', 'e']);
  expect(r.spent).toBe(65);
});

test('reordering gains a station', () => {
  const r = fit([s('a', 'circle'), s('b', 'triangle'), s('d', 'circle'), s('e', 'circle'), s('c', 'square')], 96);
  expect(r.reached).toEqual(['a', 'b', 'd']);
  expect(r.beyond).toEqual(['e', 'c']);
  expect(r.spent).toBe(85);
});

test('done stations still cost their size', () => {
  expect(fit([s('a', 'square', true), s('b', 'circle')], 96).reached).toEqual(['a']);
});

test('an empty order fits nothing and spends nothing', () => {
  expect(fit([], 96)).toEqual({ reached: [], beyond: [], spent: 0 });
});

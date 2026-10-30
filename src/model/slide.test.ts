import { expect, test } from 'vitest';
import { slideToFront } from './slide';
import type { Station } from './types';

const at = (id: string, x: number): Station => ({ id, title: id, shape: 'circle', x, y: 10, z: 0, done: false });

test('unreached stations slide to the front in line order', () => {
  const out = slideToFront([at('k', 100), at('a', 300), at('b', 500)], ['a', 'b']);
  expect(out.find((s) => s.id === 'a')).toMatchObject({ x: -28, y: 10 });
  expect(out.find((s) => s.id === 'b')).toMatchObject({ x: 36, y: 10 });
  expect(out.find((s) => s.id === 'k')).toMatchObject({ x: 100 });
});

test('with nothing else on the plane the front is left of zero', () => {
  expect(slideToFront([at('a', 300)], ['a'])[0].x).toBe(-64);
});

test('sliding nothing changes nothing', () => {
  const stations = [at('k', 100)];
  expect(slideToFront(stations, [])).toEqual(stations);
});

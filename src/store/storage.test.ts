import { expect, test } from 'vitest';
import { EMPTY } from '../model/reducer';
import type { World } from '../model/types';
import { load, save, STORAGE_KEY } from './storage';

function fakeStorage() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
  };
}

test('load returns EMPTY for missing, corrupt and wrongly shaped data', () => {
  expect(load({ getItem: () => null })).toEqual(EMPTY);
  expect(load({ getItem: () => '{not json' })).toEqual(EMPTY);
  expect(load({ getItem: () => JSON.stringify({ stations: 'no' }) })).toEqual(EMPTY);
  expect(load({ getItem: () => JSON.stringify({ stations: [], stretch: 'no', lastLength: 'couple' }) })).toEqual(EMPTY);
  expect(load({ getItem: () => JSON.stringify({ stations: [], stretch: null, lastLength: 'forever' }) })).toEqual(EMPTY);
  expect(
    load({
      getItem: () => {
        throw new Error('blocked');
      },
    }),
  ).toEqual(EMPTY);
});

test('save then load round-trips a world', () => {
  const storage = fakeStorage();
  const world: World = {
    stations: [{ id: 'a', title: 'Dentist', shape: 'circle', x: 10, y: 20, z: 0, done: false }],
    stretch: { kind: 'deep', length: 'hour', name: 'Morning', startedAt: 123, line: ['a'] },
    lastLength: 'hour',
  };
  save(storage, world);
  expect(storage.map.has(STORAGE_KEY)).toBe(true);
  expect(load(storage)).toEqual(world);
});

test('save swallows a storage that refuses to write', () => {
  expect(() =>
    save(
      {
        setItem: () => {
          throw new Error('full');
        },
      },
      EMPTY,
    ),
  ).not.toThrow();
});

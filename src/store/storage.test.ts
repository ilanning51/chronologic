import { expect, test } from 'vitest';
import { EMPTY, reduce } from '../model/reducer';
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

/** One track of two stops (a triangle, then the square goal), plus a stop no track lists. */
function sample(): World {
  return {
    tracks: [
      {
        id: 't1',
        color: 0,
        origin: { x: 0, y: 0 },
        stops: ['a', 'g'],
        train: { leg: 1, departedAt: 500 },
        target: 'next',
      },
    ],
    stops: [
      { id: 'a', title: 'Call', shape: 'triangle', size: 'small', x: 10, y: 20, done: true },
      { id: 'g', title: 'Ship', shape: 'square', size: 'large', x: 90, y: 20, done: false },
    ],
    lastTouched: 't1',
  };
}

function loadOf(world: unknown) {
  return load({ getItem: () => JSON.stringify(world) });
}

test('save then load round-trips a world', () => {
  const storage = fakeStorage();
  const world = reduce(EMPTY, { type: 'newTrack', id: 't', goalId: 'g', title: 'Ship', origin: { x: 1, y: 2 }, now: 7 });
  save(storage, world);
  expect(storage.map.has(STORAGE_KEY)).toBe(true);
  expect(load(storage)).toEqual(world);
  expect(load({ getItem: () => JSON.stringify(sample()) })).toEqual(sample());
});

test('a v1 payload under the old key is ignored and left untouched', () => {
  const storage = fakeStorage();
  const v1 = JSON.stringify({ stations: [], stretch: null, lastLength: 'couple' });
  storage.map.set('chronologic.v1', v1);
  expect(load(storage)).toEqual(EMPTY);
  expect(storage.map.get('chronologic.v1')).toBe(v1);
  save(storage, EMPTY);
  expect(storage.map.get('chronologic.v1')).toBe(v1);
});

test('a track whose last stop is not a square loads as EMPTY', () => {
  const w = sample();
  w.stops[1].shape = 'circle';
  expect(loadOf(w)).toEqual(EMPTY);
});

test('a square anywhere but last loads as EMPTY', () => {
  const w = sample();
  w.stops[0].shape = 'square';
  expect(loadOf(w)).toEqual(EMPTY);
});

test('a train leg beyond stops.length loads as EMPTY, and stops.length itself is fine', () => {
  const w = sample();
  w.tracks[0].train.leg = 3;
  expect(loadOf(w)).toEqual(EMPTY);
  w.tracks[0].train.leg = 2;
  expect(loadOf(w)).toEqual(w);
  w.tracks[0].train.leg = -1;
  expect(loadOf(w)).toEqual(EMPTY);
  w.tracks[0].train.leg = 0.5;
  expect(loadOf(w)).toEqual(EMPTY);
});

test('a stop that no track lists is fine', () => {
  const w = sample();
  w.stops.push({ id: 'orphan', title: '', shape: 'circle', size: 'medium', x: 0, y: 0, done: false });
  expect(loadOf(w)).toEqual(w);
});

test('a track naming a missing or repeated stop, or none at all, loads as EMPTY', () => {
  const missing = sample();
  missing.tracks[0].stops = ['a', 'nope', 'g'];
  expect(loadOf(missing)).toEqual(EMPTY);
  const repeated = sample();
  repeated.tracks[0].stops = ['a', 'a', 'g'];
  expect(loadOf(repeated)).toEqual(EMPTY);
  const none = sample();
  none.tracks[0].stops = [];
  none.tracks[0].train.leg = 0;
  expect(loadOf(none)).toEqual(EMPTY);
});

test('bad tracks fields load as EMPTY', () => {
  const bad = (edit: (w: World) => void) => {
    const w = sample();
    edit(w);
    expect(loadOf(w)).toEqual(EMPTY);
  };
  bad((w) => { w.tracks[0].target = 'soon' as never; });
  bad((w) => { w.tracks[0].color = -1; });
  bad((w) => { w.tracks[0].color = 1.5; });
  bad((w) => { w.tracks[0].train.departedAt = 'x' as never; });
  bad((w) => { w.tracks[0].origin = { x: 'a' as never, y: 0 }; });
});

test('bad stop fields load as EMPTY', () => {
  const bad = (edit: (w: World) => void) => {
    const w = sample();
    edit(w);
    expect(loadOf(w)).toEqual(EMPTY);
  };
  bad((w) => { w.stops[0].size = 'huge' as never; });
  bad((w) => { w.stops[0].shape = 'star' as never; });
  bad((w) => { w.stops[0].done = 'no' as never; });
  bad((w) => { w.stops[0].title = 3 as never; });
  bad((w) => { w.stops[0].id = 3 as never; });
  bad((w) => { w.stops[0].x = null as never; });
});

test('wrongly shaped top levels load as EMPTY', () => {
  expect(loadOf({ tracks: 'no', stops: [], lastTouched: null })).toEqual(EMPTY);
  expect(loadOf({ tracks: [], stops: 'no', lastTouched: null })).toEqual(EMPTY);
  expect(loadOf({ tracks: [], stops: [], lastTouched: 3 })).toEqual(EMPTY);
  expect(loadOf(null)).toEqual(EMPTY);
  expect(loadOf({ tracks: [], stops: [], lastTouched: null })).toEqual(EMPTY);
});

test('unparseable JSON, a missing key and a throwing getItem load as EMPTY', () => {
  expect(load({ getItem: () => '{not json' })).toEqual(EMPTY);
  expect(load({ getItem: () => null })).toEqual(EMPTY);
  expect(
    load({
      getItem: () => {
        throw new Error('blocked');
      },
    }),
  ).toEqual(EMPTY);
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

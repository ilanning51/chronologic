import { expect, test } from 'vitest';
import { EMPTY, reduce } from '../model/reducer';
import type { World } from '../model/types';
import { twoLines, withDay } from '../test/fixtures';
import { load, save, STORAGE_KEY, V2_KEY } from './storage';

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

test('a square that is last on no track loads as EMPTY', () => {
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

test('a v3 world round trips under the v3 key', () => {
  const storage = fakeStorage();
  save(storage, withDay());
  expect(STORAGE_KEY).toBe('chronologic.v3');
  expect(storage.map.has('chronologic.v3')).toBe(true);
  expect(load(storage)).toEqual(withDay());
});

test('a v2 world is read once and the v2 key is left untouched; the next save writes v3', () => {
  const storage = fakeStorage();
  const v2 = JSON.stringify(sample());
  storage.map.set('chronologic.v2', v2);
  expect(V2_KEY).toBe('chronologic.v2');
  const world = load(storage);
  expect(world).toEqual(sample());
  expect(storage.map.get('chronologic.v2')).toBe(v2);
  expect(storage.map.has('chronologic.v3')).toBe(false);
  save(storage, world);
  expect(storage.map.get('chronologic.v3')).toBe(JSON.stringify(sample()));
  expect(storage.map.get('chronologic.v2')).toBe(v2);
});

test('a v3 world wins over a v2 one, and a v2 world that fails opens as EMPTY', () => {
  const storage = fakeStorage();
  storage.map.set('chronologic.v2', JSON.stringify(sample()));
  storage.map.set('chronologic.v3', JSON.stringify(withDay()));
  expect(load(storage)).toEqual(withDay());
  const broken = sample();
  broken.stops[1].shape = 'circle';
  const old = fakeStorage();
  old.map.set('chronologic.v2', JSON.stringify(broken));
  expect(load(old)).toEqual(EMPTY);
});

test('a square that is last on two tracks is refused', () => {
  const w = twoLines();
  w.tracks[1].stops = ['shared', 'wristband'];
  expect(loadOf(w)).toEqual(EMPTY);
});

test('a shared stop and a goal mid-line on another track are accepted', () => {
  expect(loadOf(twoLines())).toEqual(twoLines());
  const w = twoLines();
  w.tracks[1].stops = ['shared', 'wristband', 'goal2'];
  expect(loadOf(w)).toEqual(w);
});

test('a day track with the wrong number of budgets, or a shared end square, is refused', () => {
  expect(loadOf(withDay())).toEqual(withDay());
  const short = withDay();
  short.tracks[2].day!.budgets = [1000, 0];
  expect(loadOf(short)).toEqual(EMPTY);
  const shared = withDay();
  shared.tracks[1].stops = ['dayEnd', 'goal2'];
  expect(loadOf(shared)).toEqual(EMPTY);
});

test('a day track through another goal is accepted; two day tracks or a bad date or budget are refused', () => {
  const throughGoal = withDay();
  throughGoal.tracks[2].stops = ['dentist', 'wristband', 'dayEnd'];
  expect(loadOf(throughGoal)).toEqual(throughGoal);
  const bad = (edit: (w: World) => void) => {
    const w = withDay();
    edit(w);
    expect(loadOf(w)).toEqual(EMPTY);
  };
  bad((w) => { w.tracks[1].day = { date: '2026-11-01', budgets: [0, 0] }; });
  bad((w) => { w.tracks[2].day!.date = 20261101 as never; });
  bad((w) => { w.tracks[2].day!.budgets = [1000, 'x' as never, 0]; });
  bad((w) => { w.tracks[2].day!.budgets = 'none' as never; });
  bad((w) => { w.tracks[2].day = null as never; });
});

test("a goal's picture round-trips, and one that is not an image data URL is refused", () => {
  const world = sample();
  world.stops[1].image = 'data:image/jpeg;base64,AAAA';
  expect(loadOf(world)).toEqual(world);
  world.stops[1].image = 'https://example.com/ship.jpg';
  expect(loadOf(world)).toEqual(EMPTY);
});

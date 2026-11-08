import { describe, expect, test } from 'vitest';
import { EMPTY, reduce } from '../model/reducer';
import type { World } from '../model/types';
import { twoLines, withDay, withLife, withWeek } from '../test/fixtures';
import { ensureLife, load, REFUSED_KEY, save, STORAGE_KEY, V2_KEY, V3_KEY, V4_KEY } from './storage';

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

const NOW = 5000;

/** What load returns when it has nothing it can use: the empty world with its life line. */
const FRESH = ensureLife(EMPTY, NOW);
/** A saved world as load hands it back: with a life line if it had none. */
const lived = (world: World) => ensureLife(world, NOW);

function loadOf(world: unknown) {
  return load({ getItem: () => JSON.stringify(world), setItem: () => {} }, NOW);
}

test('save then load round-trips a world', () => {
  const storage = fakeStorage();
  const world = reduce(EMPTY, { type: 'newTrack', id: 't', goalId: 'g', title: 'Ship', origin: { x: 1, y: 2 }, now: 7 });
  save(storage, world);
  expect(storage.map.has(STORAGE_KEY)).toBe(true);
  expect(load(storage, NOW)).toEqual(lived(world));
  expect(loadOf(sample())).toEqual(lived(sample()));
});

test('a v1 payload under the old key is ignored and left untouched', () => {
  const storage = fakeStorage();
  const v1 = JSON.stringify({ stations: [], stretch: null, lastLength: 'couple' });
  storage.map.set('chronologic.v1', v1);
  expect(load(storage, NOW)).toEqual(FRESH);
  expect(storage.map.get('chronologic.v1')).toBe(v1);
  save(storage, EMPTY);
  expect(storage.map.get('chronologic.v1')).toBe(v1);
});

test('a track whose last stop is not a square loads as EMPTY', () => {
  const w = sample();
  w.stops[1].shape = 'circle';
  expect(loadOf(w)).toEqual(FRESH);
});

test('a square that is last on no track loads as EMPTY', () => {
  const w = sample();
  w.stops[0].shape = 'square';
  expect(loadOf(w)).toEqual(FRESH);
});

test('a train leg beyond stops.length loads as EMPTY, and stops.length itself is fine', () => {
  const w = sample();
  w.tracks[0].train.leg = 3;
  expect(loadOf(w)).toEqual(FRESH);
  w.tracks[0].train.leg = 2;
  expect(loadOf(w)).toEqual(lived(w));
  w.tracks[0].train.leg = -1;
  expect(loadOf(w)).toEqual(FRESH);
  w.tracks[0].train.leg = 0.5;
  expect(loadOf(w)).toEqual(FRESH);
});

test('a stop that no track lists is fine', () => {
  const w = sample();
  w.stops.push({ id: 'orphan', title: '', shape: 'circle', size: 'medium', x: 0, y: 0, done: false });
  expect(loadOf(w)).toEqual(lived(w));
});

test('a track naming a missing or repeated stop, or none at all, loads as EMPTY', () => {
  const missing = sample();
  missing.tracks[0].stops = ['a', 'nope', 'g'];
  expect(loadOf(missing)).toEqual(FRESH);
  const repeated = sample();
  repeated.tracks[0].stops = ['a', 'a', 'g'];
  expect(loadOf(repeated)).toEqual(FRESH);
  const none = sample();
  none.tracks[0].stops = [];
  none.tracks[0].train.leg = 0;
  expect(loadOf(none)).toEqual(FRESH);
});

test('bad tracks fields load as EMPTY', () => {
  const bad = (edit: (w: World) => void) => {
    const w = sample();
    edit(w);
    expect(loadOf(w)).toEqual(FRESH);
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
    expect(loadOf(w)).toEqual(FRESH);
  };
  bad((w) => { w.stops[0].size = 'huge' as never; });
  bad((w) => { w.stops[0].shape = 'star' as never; });
  bad((w) => { w.stops[0].done = 'no' as never; });
  bad((w) => { w.stops[0].title = 3 as never; });
  bad((w) => { w.stops[0].id = 3 as never; });
  bad((w) => { w.stops[0].x = null as never; });
});

test('wrongly shaped top levels load as EMPTY', () => {
  expect(loadOf({ tracks: 'no', stops: [], lastTouched: null })).toEqual(FRESH);
  expect(loadOf({ tracks: [], stops: 'no', lastTouched: null })).toEqual(FRESH);
  expect(loadOf({ tracks: [], stops: [], lastTouched: 3 })).toEqual(FRESH);
  expect(loadOf(null)).toEqual(FRESH);
  expect(loadOf({ tracks: [], stops: [], lastTouched: null })).toEqual(FRESH);
});

test('unparseable JSON, a missing key and a throwing getItem load as EMPTY', () => {
  expect(load({ getItem: () => '{not json', setItem: () => {} }, NOW)).toEqual(FRESH);
  expect(load({ getItem: () => null, setItem: () => {} }, NOW)).toEqual(FRESH);
  expect(
    load(
      {
        getItem: () => {
          throw new Error('blocked');
        },
        setItem: () => {},
      },
      NOW,
    ),
  ).toEqual(FRESH);
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

test('a world round trips under the v5 key', () => {
  const storage = fakeStorage();
  save(storage, withDay());
  expect(storage.map.has('chronologic.v5')).toBe(true);
  expect(storage.map.has('chronologic.v4')).toBe(false);
  expect(load(storage, NOW)).toEqual(lived(withDay()));
});

test('a v2 world is read once and the v2 key is left untouched; the next save writes v5', () => {
  const storage = fakeStorage();
  const v2 = JSON.stringify(sample());
  storage.map.set('chronologic.v2', v2);
  expect(V2_KEY).toBe('chronologic.v2');
  expect(V3_KEY).toBe('chronologic.v3');
  const world = load(storage, NOW);
  expect(world).toEqual(lived(sample()));
  expect(storage.map.get('chronologic.v2')).toBe(v2);
  expect(storage.map.has('chronologic.v5')).toBe(false);
  save(storage, world);
  expect(storage.map.get('chronologic.v5')).toBe(JSON.stringify(lived(sample())));
  expect(storage.map.has('chronologic.v4')).toBe(false);
  expect(storage.map.has('chronologic.v3')).toBe(false);
  expect(storage.map.get('chronologic.v2')).toBe(v2);
});

test('v5 wins over v4, v4 over v3, v3 over v2, and an old world that fails opens as a fresh world', () => {
  const storage = fakeStorage();
  storage.map.set('chronologic.v2', JSON.stringify(sample()));
  storage.map.set('chronologic.v3', JSON.stringify(twoLines()));
  expect(load(storage, NOW)).toEqual(lived(twoLines()));
  storage.map.set('chronologic.v4', JSON.stringify(withDay()));
  expect(load(storage, NOW)).toEqual(lived(withDay()));
  storage.map.set('chronologic.v5', JSON.stringify(withLife()));
  expect(load(storage, NOW)).toEqual(withLife());
  const broken = sample();
  broken.stops[1].shape = 'circle';
  const old = fakeStorage();
  old.map.set('chronologic.v2', JSON.stringify(broken));
  expect(load(old, NOW)).toEqual(FRESH);
});

test('a square that is last on two tracks is refused', () => {
  const w = twoLines();
  w.tracks[1].stops = ['shared', 'wristband'];
  expect(loadOf(w)).toEqual(FRESH);
});

test('a shared stop and a goal mid-line on another track are accepted', () => {
  expect(loadOf(twoLines())).toEqual(lived(twoLines()));
  const w = twoLines();
  w.tracks[1].stops = ['shared', 'wristband', 'goal2'];
  expect(loadOf(w)).toEqual(lived(w));
});

test('a day track with the wrong number of budgets, or a shared end square, is refused', () => {
  expect(loadOf(withDay())).toEqual(lived(withDay()));
  const short = withDay();
  short.tracks[2].day!.budgets = [1000, 0];
  expect(loadOf(short)).toEqual(FRESH);
  const shared = withDay();
  shared.tracks[1].stops = ['dayEnd', 'goal2'];
  expect(loadOf(shared)).toEqual(FRESH);
});

test('a day track through another goal is accepted; two day tracks on one date or a bad date or budget are refused', () => {
  const throughGoal = withDay();
  throughGoal.tracks[2].stops = ['dentist', 'wristband', 'dayEnd'];
  expect(loadOf(throughGoal)).toEqual(lived(throughGoal));
  const bad = (edit: (w: World) => void) => {
    const w = withDay();
    edit(w);
    expect(loadOf(w)).toEqual(FRESH);
  };
  bad((w) => { w.tracks[1].day = { date: '2026-11-01', budgets: [0, 0], lengths: [3600, 7200] }; });
  bad((w) => { w.tracks[2].day!.date = 20261101 as never; });
  bad((w) => { w.tracks[2].day!.budgets = [1000, 'x' as never, 0]; });
  bad((w) => { w.tracks[2].day!.budgets = 'none' as never; });
  bad((w) => { w.tracks[2].day = null as never; });
});

test("a goal's picture round-trips, and one that is not an image data URL is refused", () => {
  const world = sample();
  world.stops[1].image = 'data:image/jpeg;base64,AAAA';
  expect(loadOf(world)).toEqual(lived(world));
  world.stops[1].image = 'https://example.com/ship.jpg';
  expect(loadOf(world)).toEqual(FRESH);
});

test('a world with a day line for each of two dates round-trips', () => {
  const storage = fakeStorage();
  save(storage, withWeek());
  expect(STORAGE_KEY).toBe('chronologic.v5');
  expect(load(storage, NOW)).toEqual(lived(withWeek()));
});

test("deleting the second day's end square leaves a world that reloads with the first day whole", () => {
  const storage = fakeStorage();
  const next = reduce(withWeek(), { type: 'delete', id: 'dayEnd2', now: 0 });
  expect(next.tracks.map((t) => t.id)).toEqual(['t1', 't2', 'day']);
  save(storage, next);
  expect(load(storage, NOW)).toEqual(lived(next));
});

test('a v3 world with one day loads, its blocks given their default lengths, and no old key is written', () => {
  const storage = fakeStorage();
  const v3 = withDay();
  delete (v3.tracks[2].day as { lengths?: number[] }).lengths;
  storage.map.set(V3_KEY, JSON.stringify(v3));
  storage.map.set(V2_KEY, JSON.stringify(sample()));
  expect(load(storage, NOW)).toEqual(lived(withDay()));
  save(storage, load(storage, NOW));
  expect(storage.map.get(V3_KEY)).toBe(JSON.stringify(v3));
  expect(storage.map.get(V2_KEY)).toBe(JSON.stringify(sample()));
});

test('two days on one date, lengths out of step with stops, or an end square on a project are refused', () => {
  const bad = (edit: (w: World) => void) => {
    const w = withWeek();
    edit(w);
    expect(loadOf(w)).toEqual(FRESH);
  };
  bad((w) => { w.tracks[3].day!.date = '2026-11-01'; });
  bad((w) => { w.tracks[3].day!.lengths = [7200]; });
  bad((w) => { w.tracks[3].day!.lengths = [7200, 'x' as never]; });
  bad((w) => { w.tracks[3].day!.held = 'yes' as never; });
  bad((w) => { w.tracks[1].stops = ['shared', 'dayEnd2', 'goal2']; });
});

test('when a stop was done round-trips, and a time that is not a number is refused', () => {
  const world = sample();
  world.stops[0].doneAt = 400;
  expect(loadOf(world)).toEqual(lived(world));
  world.stops[0].doneAt = '400' as never;
  expect(loadOf(world)).toEqual(FRESH);
});

describe('the life line in storage', () => {
  /** withLife() with its life line holding only Start and Wristband, so the ring is the rightmost square. */
  function ringLast(): World {
    const w = withLife();
    w.stops = w.stops.filter((s) => s.id !== 'far');
    w.tracks = w.tracks.map((t) => (t.life ? { ...t, stops: ['start', 'wristband'], life: { y: -800, budgets: [0, 0] } } : t));
    return w;
  }
  const lifeCount = (w: World) => w.tracks.filter((t) => t.life).length;
  const lifeIn = (w: World) => w.tracks.find((t) => t.life)!;

  test('a v4 world of two lines loads with those lines and an empty life line below them, and the next save writes v5', () => {
    const storage = fakeStorage();
    storage.map.set(V4_KEY, JSON.stringify(twoLines()));
    const world = load(storage, NOW);
    // Shared and Goal 2 sit at y 600, the lowest; the life line is a day of world units under them, from the leftmost stop.
    expect(world.tracks[0]).toMatchObject({
      origin: { x: 1000, y: 600 + 86400 },
      stops: [],
      train: { leg: 0, departedAt: NOW },
      target: 'next',
      life: { y: 600 + 86400, budgets: [] },
    });
    expect(world.tracks.slice(1)).toEqual(twoLines().tracks);
    expect(world.stops).toEqual(twoLines().stops);
    save(storage, world);
    expect(storage.map.has(STORAGE_KEY)).toBe(true);
    expect(storage.map.get(V4_KEY)).toBe(JSON.stringify(twoLines()));
  });

  test('a fresh world gets a life line through the origin', () => {
    expect(FRESH.tracks).toHaveLength(1);
    expect(FRESH.tracks[0]).toMatchObject({ origin: { x: 0, y: 0 }, stops: [], life: { y: 0, budgets: [] } });
    expect(EMPTY.tracks).toEqual([]);
  });

  test('worlds with a life line round-trip unchanged: empty, a mid-line marker, and a ring last on the line', () => {
    for (const world of [FRESH, withLife(), ringLast()]) {
      const storage = fakeStorage();
      save(storage, world);
      expect(load(storage, NOW)).toEqual(world);
    }
  });

  test('a world with two life lines is refused, and one with none gains exactly one', () => {
    const two = withLife();
    two.tracks.push({ ...lifeIn(two), id: 'life2', stops: [], train: { leg: 0, departedAt: 0 }, life: { y: -800, budgets: [] } });
    expect(loadOf(two)).toEqual(FRESH);
    expect(lifeCount(loadOf(twoLines()))).toBe(1);
    expect(loadOf(twoLines()).tracks).toHaveLength(twoLines().tracks.length + 1);
  });

  test('a life line with a circle, a non-finite height, or budgets of the wrong length is refused', () => {
    const bad = (edit: (w: World) => void) => {
      const w = withLife();
      edit(w);
      expect(loadOf(w)).toEqual(FRESH);
    };
    bad((w) => { w.stops.find((s) => s.id === 'far')!.shape = 'circle'; });
    bad((w) => { lifeIn(w).life!.budgets = [0, 0]; });
    bad((w) => { lifeIn(w).life!.y = null as never; });
  });

  test('a square on a project that is not its end is refused, and so is one that ends two projects', () => {
    const midLine = withLife();
    midLine.tracks[0].stops = ['dentist', 'start', 'wristband'];
    expect(loadOf(midLine)).toEqual(FRESH);
    const twoEnds = withLife();
    twoEnds.tracks[0].stops = ['dentist', 'wristband'];
    twoEnds.tracks.push({ id: 't3', color: 2, origin: { x: 0, y: 900 }, stops: ['wristband'], train: { leg: 0, departedAt: 0 }, target: 'goal' });
    expect(loadOf(twoEnds)).toEqual(FRESH);
  });

  test('a refused v5 world is kept once under the refused key, and a second refusal does not overwrite it', () => {
    const storage = fakeStorage();
    const broken = JSON.stringify({ ...withLife(), lastTouched: 3 });
    storage.map.set(STORAGE_KEY, broken);
    expect(load(storage, NOW)).toEqual(FRESH);
    expect(REFUSED_KEY).toBe('chronologic.v5.refused');
    expect(storage.map.get(REFUSED_KEY)).toBe(broken);
    storage.map.set(STORAGE_KEY, '{not json');
    expect(load(storage, NOW)).toEqual(FRESH);
    expect(storage.map.get(REFUSED_KEY)).toBe(broken);
  });

  test('a refusal of an older key writes no refused copy', () => {
    const storage = fakeStorage();
    const broken = sample();
    broken.stops[1].shape = 'circle';
    storage.map.set(V3_KEY, JSON.stringify(broken));
    load(storage, NOW);
    expect(storage.map.has(REFUSED_KEY)).toBe(false);
  });

  test('the world after a refused load, or with nothing saved, has one life line and saves and reloads unchanged', () => {
    for (const raw of [null, '{not json', JSON.stringify({ tracks: 'no' })]) {
      const storage = fakeStorage();
      if (raw !== null) storage.map.set(STORAGE_KEY, raw);
      const world = load(storage, NOW);
      expect(lifeCount(world)).toBe(1);
      save(storage, world);
      expect(load(storage, NOW)).toEqual(world);
    }
  });

  test('older keys are never written', () => {
    const storage = fakeStorage();
    storage.map.set(V4_KEY, JSON.stringify(twoLines()));
    save(storage, load(storage, NOW));
    expect([...storage.map.keys()].sort()).toEqual([STORAGE_KEY, V4_KEY].sort());
  });

  test('withLife() validates, and so does every world a life action leaves behind', () => {
    expect(loadOf(withLife())).toEqual(withLife());
    const now = 250_000;
    const accepted = (world: World) => expect(loadOf(world)).toEqual(world);
    const left = reduce(withLife(), { type: 'leave', trackId: 'life', stopId: 'wristband', now });
    expect(lifeIn(left).stops).toEqual(['start', 'far']);
    accepted(left);
    const joined = reduce(left, { type: 'join', trackId: 'life', stopId: 'wristband', leg: 0, x: 3000, y: 0, now });
    expect(lifeIn(joined).stops).toEqual(['start', 'wristband', 'far']);
    accepted(joined);
    accepted(reduce(withLife(), { type: 'delete', id: 'far', now }));
    accepted(reduce(withLife(), { type: 'delete', id: 'wristband', now }));
    accepted(reduce(withLife(), { type: 'delete', id: 'start', now }));
    accepted(reduce(withLife(), { type: 'move', id: 'far', x: 200, y: 0, now }));
    accepted(reduce(withLife(), { type: 'move', id: 'wristband', x: 4000, y: 0, now }));
    const done = reduce(withLife(), { type: 'complete', trackId: 'life', now });
    expect(done.stops.find((s) => s.id === 'start')!.done).toBe(true);
    accepted(done);
    accepted(reduce(done, { type: 'undo', stopId: 'start', now: now + 1000 }));
  });
});

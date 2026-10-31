import { describe, expect, test } from 'vitest';
import { DEFAULT_GOAL_SECONDS, EMPTY, reduce } from './reducer';
import { legSeconds, trackRoute, trainState } from './train';
import type { Stop, World } from './types';

function stop(id: string, shape: Stop['shape'], x: number, y: number, done = false): Stop {
  return { id, title: id, shape, size: 'medium', x, y, done };
}

const trackId = 't';
const now = 500_000;

/** One track from the origin through a, b and the goal g, the train half way along leg 0. */
function running(): World {
  return {
    tracks: [
      {
        id: trackId,
        color: 0,
        origin: { x: 0, y: 0 },
        stops: ['a', 'b', 'g'],
        train: { leg: 0, departedAt: 0 },
        target: 'next',
      },
    ],
    stops: [stop('a', 'circle', 1000, 0), stop('b', 'triangle', 1000, 1000), stop('g', 'square', 3000, 1000)],
    lastTouched: null,
  };
}

function byId(world: World): Map<string, Stop> {
  return new Map(world.stops.map((s) => [s.id, s]));
}

/** The seconds of every leg of the first track, added up. */
function total(world: World): number {
  const route = trackRoute(world.tracks[0], byId(world));
  let sum = 0;
  for (let leg = 0; leg < world.tracks[0].stops.length; leg++) sum += legSeconds(route, leg);
  return sum;
}

function stateOf(world: World) {
  return trainState(world.tracks[0], byId(world), now);
}

const stopOf = (world: World, id: string) => world.stops.find((s) => s.id === id)!;

describe('newTrack', () => {
  test('makes a large square goal a month out, a train about to leave, and cycles colours', () => {
    const one = reduce(EMPTY, { type: 'newTrack', id: 't1', goalId: 'g1', title: 'Book', origin: { x: 10, y: 20 }, now });
    expect(one.tracks[0]).toEqual({
      id: 't1',
      color: 0,
      origin: { x: 10, y: 20 },
      stops: ['g1'],
      train: { leg: 0, departedAt: now },
      target: 'goal',
    });
    expect(one.stops).toEqual([
      { id: 'g1', title: 'Book', shape: 'square', size: 'large', x: 10 + DEFAULT_GOAL_SECONDS, y: 20, done: false },
    ]);
    expect(one.lastTouched).toBe('t1');
    let w = one;
    for (let i = 2; i <= 9; i++) {
      w = reduce(w, { type: 'newTrack', id: `t${i}`, goalId: `g${i}`, title: '', origin: { x: 0, y: 0 }, now });
    }
    expect(w.tracks.map((t) => t.color)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 0]);
  });

  test('an id that already exists is ignored', () => {
    const w = running();
    expect(reduce(w, { type: 'newTrack', id: trackId, goalId: 'z', title: '', origin: { x: 0, y: 0 }, now })).toBe(w);
    expect(reduce(w, { type: 'newTrack', id: 'u', goalId: 'g', title: '', origin: { x: 0, y: 0 }, now })).toBe(w);
  });
});

describe('addStop', () => {
  test('adding a stop on the path leaves the total unchanged and keeps the train put', () => {
    const world = running();
    const before = trainState(world.tracks[0], byId(world), now).seconds;
    const next = reduce(world, { type: 'addStop', trackId, id: 'n', shape: 'circle', leg: 0, x: 800, y: 0, now });
    expect(next.tracks[0].stops).toEqual(['n', 'a', 'b', 'g']);
    expect(stopOf(next, 'n')).toEqual({ id: 'n', title: '', shape: 'circle', size: 'medium', x: 800, y: 0, done: false });
    expect(total(next)).toBeCloseTo(total(world));
    expect(trainState(next.tracks[0], byId(next), now).seconds).toBeCloseTo(before);
    expect(next.tracks[0].train.leg).toBe(0);
    expect(next.lastTouched).toBe(trackId);
  });

  test('inserts at the given index, before the goal at the latest', () => {
    const next = reduce(running(), { type: 'addStop', trackId, id: 'n', shape: 'triangle', leg: 2, x: 2000, y: 1000, now });
    expect(next.tracks[0].stops).toEqual(['a', 'b', 'n', 'g']);
  });

  test('is ignored behind the train, at or past the goal index, and for unknown tracks', () => {
    const w = running();
    w.tracks[0].train = { leg: 1, departedAt: now };
    expect(reduce(w, { type: 'addStop', trackId, id: 'n', shape: 'circle', leg: 0, x: 0, y: 0, now })).toBe(w);
    expect(reduce(running(), { type: 'addStop', trackId, id: 'n', shape: 'circle', leg: 3, x: 0, y: 0, now }).stops).toHaveLength(3);
    expect(reduce(running(), { type: 'addStop', trackId: 'nope', id: 'n', shape: 'circle', leg: 0, x: 0, y: 0, now }).stops).toHaveLength(3);
  });

  test('is ignored once the train is parked', () => {
    const w = running();
    w.tracks[0].train = { leg: 3, departedAt: now };
    expect(reduce(w, { type: 'addStop', trackId, id: 'n', shape: 'circle', leg: 2, x: 0, y: 0, now })).toBe(w);
  });
});

describe('move', () => {
  test('dragging the next stop onto the train makes the train wait there', () => {
    const world = running();
    const T = stateOf(world).at;
    const next = reduce(world, { type: 'move', id: 'a', x: T.x, y: T.y, now });
    expect(stopOf(next, 'a')).toMatchObject({ x: 500, y: 0 });
    expect(stateOf(next)).toMatchObject({ leg: 0, waiting: true });
    expect(stateOf(next).seconds).toBeCloseTo(500);
    expect(next.lastTouched).toBe(trackId);
  });

  test('is ignored for a done stop, for the goal, and for unknown ids', () => {
    const w = running();
    w.stops[0] = stop('a', 'circle', 1000, 0, true);
    w.tracks[0].train = { leg: 1, departedAt: now };
    expect(reduce(w, { type: 'move', id: 'a', x: 5, y: 5, now })).toBe(w);
    expect(reduce(w, { type: 'move', id: 'g', x: 5, y: 5, now })).toBe(w);
    expect(reduce(w, { type: 'move', id: 'zzz', x: 5, y: 5, now })).toBe(w);
  });

  test('a move that keeps the seconds of the drag start gives them back after a shorter leg', () => {
    const world = running();
    const keep = stateOf(world).seconds;
    // Pulled behind the train, the leg is shorter than the train's offset and the train waits.
    const pulled = reduce(world, { type: 'move', id: 'a', x: 200, y: 0, now, keep });
    expect(stateOf(pulled)).toMatchObject({ waiting: true });
    // Put back where it was, the train has its seconds again.
    const back = reduce(pulled, { type: 'move', id: 'a', x: 1000, y: 0, now, keep });
    expect(stateOf(back).seconds).toBeCloseTo(keep);
    expect(back.tracks[0].train).toEqual(world.tracks[0].train);
  });
});

describe('moveGoal', () => {
  test('scales every pending stop ahead of the train about the train', () => {
    const world = running();
    // T = (500, 0); G = (3000, 1000). Sending G to T + 2 (G - T) makes k = 2.
    const next = reduce(world, { type: 'moveGoal', trackId, x: 5500, y: 2000, now });
    expect(stopOf(next, 'g')).toMatchObject({ x: 5500, y: 2000 });
    expect(stopOf(next, 'b').x).toBeCloseTo(1500);
    expect(stopOf(next, 'b').y).toBeCloseTo(2000);
    expect(stopOf(next, 'a').x).toBeCloseTo(1500);
    expect(stopOf(next, 'a').y).toBeCloseTo(0);
    expect(stateOf(next).seconds).toBeCloseTo(500);
    expect(next.lastTouched).toBe(trackId);
  });

  test('leaves stops behind the train alone, and uses k = 1 when the goal is under the train', () => {
    const w = running();
    w.stops[0] = stop('a', 'circle', 1000, 0, true);
    w.tracks[0].train = { leg: 1, departedAt: now - 10_000_000 }; // waiting at b
    const next = reduce(w, { type: 'moveGoal', trackId, x: 2000, y: 3000, now });
    expect(stopOf(next, 'a')).toMatchObject({ x: 1000, y: 0 });
    expect(stopOf(next, 'b')).toMatchObject({ x: 1000, y: 1000 });
    const under = running();
    under.stops[2] = stop('g', 'square', 500, 0);
    const same = reduce(under, { type: 'moveGoal', trackId, x: 700, y: 0, now });
    expect(stopOf(same, 'a')).toMatchObject({ x: 1000, y: 0 });
    expect(stopOf(same, 'g')).toMatchObject({ x: 700, y: 0 });
  });

  test('with the drag start snapshot, each move scales the original stops, so passing over the train collapses nothing', () => {
    const world = running();
    const keep = stateOf(world).seconds;
    const from = { train: { x: 500, y: 0 }, goal: { x: 3000, y: 1000 }, ahead: { a: { x: 1000, y: 0 }, b: { x: 1000, y: 1000 } } };
    // Exactly over the train, k = 0 for this move only.
    const over = reduce(world, { type: 'moveGoal', trackId, x: 500, y: 0, now, keep, from });
    expect(stopOf(over, 'b')).toMatchObject({ x: 500, y: 0 });
    const beyond = reduce(over, { type: 'moveGoal', trackId, x: 5500, y: 2000, now, keep, from });
    expect(stopOf(beyond, 'a').x).toBeCloseTo(1500);
    expect(stopOf(beyond, 'a').y).toBeCloseTo(0);
    expect(stopOf(beyond, 'b').x).toBeCloseTo(1500);
    expect(stopOf(beyond, 'b').y).toBeCloseTo(2000);
    expect(stateOf(beyond).seconds).toBeCloseTo(keep);
  });

  test('is ignored when the goal is done or the train is parked', () => {
    const w = running();
    w.stops[2] = stop('g', 'square', 3000, 1000, true);
    w.tracks[0].train = { leg: 3, departedAt: now };
    expect(reduce(w, { type: 'moveGoal', trackId, x: 1, y: 1, now })).toBe(w);
  });
});

describe('edit', () => {
  test('changes title, shape and size and marks the track touched', () => {
    const next = reduce(running(), { type: 'edit', id: 'a', title: 'Call', shape: 'triangle', size: 'large' });
    expect(stopOf(next, 'a')).toEqual({ id: 'a', title: 'Call', shape: 'triangle', size: 'large', x: 1000, y: 0, done: false });
    expect(next.lastTouched).toBe(trackId);
  });

  test('the goal stays a square but takes the other fields; unknown ids are ignored', () => {
    const next = reduce(running(), { type: 'edit', id: 'g', title: 'Ship', shape: 'circle', size: 'small' });
    expect(stopOf(next, 'g')).toMatchObject({ title: 'Ship', shape: 'square', size: 'small' });
    const w = running();
    expect(reduce(w, { type: 'edit', id: 'zzz', title: 'x' })).toBe(w);
  });
});

describe('delete', () => {
  test('a stop ahead of the train goes and the train does not move', () => {
    const next = reduce(running(), { type: 'delete', id: 'b', now });
    expect(next.tracks[0].stops).toEqual(['a', 'g']);
    expect(next.stops.map((s) => s.id)).toEqual(['a', 'g']);
    expect(next.tracks[0].train.leg).toBe(0);
    expect(stateOf(next).seconds).toBeCloseTo(500);
  });

  test('the stop the train is heading for goes: same leg, same seconds', () => {
    const next = reduce(running(), { type: 'delete', id: 'a', now });
    expect(next.tracks[0].stops).toEqual(['b', 'g']);
    expect(next.tracks[0].train.leg).toBe(0);
    expect(stateOf(next).seconds).toBeCloseTo(500);
  });

  test('the dot just behind the train goes: the merged leg counts the removed leg, so the train never goes back', () => {
    const w = running();
    w.stops[0] = stop('a', 'circle', 1000, 0, true);
    w.tracks[0].train = { leg: 1, departedAt: now - 300_000 };
    const before = stateOf(w).seconds;
    const next = reduce(w, { type: 'delete', id: 'a', now });
    expect(next.tracks[0].stops).toEqual(['b', 'g']);
    expect(next.tracks[0].train.leg).toBe(0);
    // The removed leg, origin to a, was 1000 s long.
    expect(stateOf(next).seconds).toBeCloseTo(before + 1000);
  });

  test('a dot further behind the train goes and the leg index drops by one, seconds kept', () => {
    const w = running();
    w.stops[0] = stop('a', 'circle', 1000, 0, true);
    w.stops[1] = stop('b', 'triangle', 1000, 1000, true);
    w.tracks[0].train = { leg: 2, departedAt: now - 300_000 };
    const before = stateOf(w).seconds;
    const next = reduce(w, { type: 'delete', id: 'a', now });
    expect(next.tracks[0].stops).toEqual(['b', 'g']);
    expect(next.tracks[0].train.leg).toBe(1);
    expect(stateOf(next).seconds).toBeCloseTo(before);
  });

  test('deleting the goal deletes the track and its stops, and clears lastTouched if it named it', () => {
    const w = running();
    w.lastTouched = trackId;
    const next = reduce(w, { type: 'delete', id: 'g', now });
    expect(next).toEqual({ tracks: [], stops: [], lastTouched: null });
    const other = reduce({ ...running(), lastTouched: 'elsewhere' }, { type: 'delete', id: 'g', now });
    expect(other.lastTouched).toBe('elsewhere');
  });

  test('unknown ids are ignored', () => {
    const w = running();
    expect(reduce(w, { type: 'delete', id: 'zzz', now })).toBe(w);
  });
});

describe('complete and undo', () => {
  test('only the next stop completes, and undo restores the most recent dot with the train waiting at it', () => {
    const w = running();
    const one = reduce(w, { type: 'complete', trackId, now });
    expect(stopOf(one, 'a').done).toBe(true);
    expect(stopOf(one, 'b').done).toBe(false);
    expect(one.tracks[0].train).toEqual({ leg: 1, departedAt: now });
    expect(one.lastTouched).toBe(trackId);
    const back = reduce(one, { type: 'undo', trackId, now });
    expect(stopOf(back, 'a').done).toBe(false);
    expect(back.tracks[0].train.leg).toBe(0);
    expect(stateOf(back)).toMatchObject({ leg: 0, waiting: true });
    expect(stateOf(back).seconds).toBeCloseTo(1000);
  });

  test('undo with nothing done is ignored; completing the goal parks the train and undo wakes it', () => {
    const w = running();
    expect(reduce(w, { type: 'undo', trackId, now })).toBe(w);
    let p = w;
    for (let i = 0; i < 3; i++) p = reduce(p, { type: 'complete', trackId, now });
    expect(p.tracks[0].train).toEqual({ leg: 3, departedAt: now });
    expect(stopOf(p, 'g').done).toBe(true);
    expect(reduce(p, { type: 'complete', trackId, now })).toBe(p);
    const back = reduce(p, { type: 'undo', trackId, now });
    expect(stopOf(back, 'g').done).toBe(false);
    expect(back.tracks[0].train.leg).toBe(2);
    expect(stateOf(back).waiting).toBe(true);
  });

  test('parked tracks ignore move, moveGoal and non-goal delete', () => {
    let p = running();
    for (let i = 0; i < 3; i++) p = reduce(p, { type: 'complete', trackId, now });
    expect(reduce(p, { type: 'delete', id: 'a', now })).toBe(p);
    expect(reduce(p, { type: 'move', id: 'a', x: 1, y: 1, now })).toBe(p);
    expect(reduce(p, { type: 'moveGoal', trackId, x: 1, y: 1, now })).toBe(p);
  });

  test('unknown tracks are ignored', () => {
    const w = running();
    expect(reduce(w, { type: 'complete', trackId: 'x', now })).toBe(w);
    expect(reduce(w, { type: 'undo', trackId: 'x', now })).toBe(w);
    expect(reduce(w, { type: 'cycleTarget', trackId: 'x' })).toBe(w);
  });
});

describe('cycleTarget', () => {
  test('goes next, subgoal, goal, next, and marks the track touched', () => {
    let w = running();
    const seen: string[] = [];
    for (let i = 0; i < 4; i++) {
      w = reduce(w, { type: 'cycleTarget', trackId });
      seen.push(w.tracks[0].target);
    }
    expect(seen).toEqual(['subgoal', 'goal', 'next', 'subgoal']);
    expect(w.lastTouched).toBe(trackId);
  });
});

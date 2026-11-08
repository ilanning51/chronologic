import { describe, expect, test } from 'vitest';
import { DEFAULT_GOAL_SECONDS, EMPTY, reduce, undoable } from './reducer';
import { dayState, legSeconds, lifeState, timeLeftAny, trackRoute, trainState } from './train';
import { running as fixtureRunning, twoLines, withDay as fixtureDay, withLife, withWeek } from '../test/fixtures';
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
  test('a goal point puts the goal there', () => {
    const w = reduce(EMPTY, { type: 'newTrack', id: 't', goalId: 'g', title: '', origin: { x: 0, y: 0 }, goal: { x: 500, y: -200 }, now });
    expect(stopOf(w, 'g')).toMatchObject({ x: 500, y: -200, shape: 'square', size: 'large' });
    expect(w.tracks[0].origin).toEqual({ x: 0, y: 0 });
    expect(w.tracks[0].train).toEqual({ leg: 0, departedAt: now });
  });

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
    const pulled = reduce(world, { type: 'move', id: 'a', x: 200, y: 0, now, keep: { [trackId]: keep } });
    expect(stateOf(pulled)).toMatchObject({ waiting: true });
    // Put back where it was, the train has its seconds again.
    const back = reduce(pulled, { type: 'move', id: 'a', x: 1000, y: 0, now, keep: { [trackId]: keep } });
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
    const over = reduce(world, { type: 'moveGoal', trackId, x: 500, y: 0, now, keep: { [trackId]: keep }, from });
    expect(stopOf(over, 'b')).toMatchObject({ x: 500, y: 0 });
    const beyond = reduce(over, { type: 'moveGoal', trackId, x: 5500, y: 2000, now, keep: { [trackId]: keep }, from });
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
  test('a picture on a goal is a change, so the no-op rule never swallows it', () => {
    const w = running();
    const goal = w.tracks[0].stops[w.tracks[0].stops.length - 1];
    const next = reduce(w, { type: 'edit', id: goal, image: 'data:image/png;base64,AAAA' });
    expect(next).not.toBe(w);
    expect(stopOf(next, goal).image).toBe('data:image/png;base64,AAAA');
    expect(reduce(w, { type: 'edit', id: goal, image: null })).toBe(w); // no picture to take away
  });

  test('an edit that changes nothing returns the same world', () => {
    const w = running();
    const title = stopOf(w, 'a').title;
    expect(reduce(w, { type: 'edit', id: 'a', title })).toBe(w);
    expect(reduce(w, { type: 'edit', id: 'a', shape: stopOf(w, 'a').shape as 'circle' })).toBe(w);
  });

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
    const back = reduce(one, { type: 'undo', stopId: 'a', now });
    expect(stopOf(back, 'a').done).toBe(false);
    expect(back.tracks[0].train.leg).toBe(0);
    expect(stateOf(back)).toMatchObject({ leg: 0, waiting: true });
    expect(stateOf(back).seconds).toBeCloseTo(1000);
  });

  test('undo with nothing done is ignored; completing the goal parks the train and undo wakes it', () => {
    const w = running();
    expect(reduce(w, { type: 'undo', stopId: 'a', now })).toBe(w);
    let p = w;
    for (let i = 0; i < 3; i++) p = reduce(p, { type: 'complete', trackId, now });
    expect(p.tracks[0].train).toEqual({ leg: 3, departedAt: now });
    expect(stopOf(p, 'g').done).toBe(true);
    expect(reduce(p, { type: 'complete', trackId, now })).toBe(p);
    const back = reduce(p, { type: 'undo', stopId: 'g', now });
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
    expect(reduce(w, { type: 'undo', stopId: 'x', now })).toBe(w);
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

  test('on the life line goes between the next square and the last, with no sub-goal between', () => {
    let w = withLife();
    const seen: string[] = [];
    for (let i = 0; i < 3; i++) {
      w = reduce(w, { type: 'cycleTarget', trackId: 'life' });
      seen.push(w.tracks.find((t) => t.life)!.target);
    }
    expect(seen).toEqual(['goal', 'next', 'goal']);
  });
});

describe('shared stops', () => {
  const at = (world: World, id: string) => trainState(world.tracks.find((t) => t.id === id)!, byId(world), now);
  const trackOf = (world: World, id: string) => world.tracks.find((t) => t.id === id)!;
  /** Marks stops done in place. */
  const done = (world: World, ...ids: string[]) => {
    world.stops = world.stops.map((s) => (ids.includes(s.id) ? { ...s, done: true } : s));
    return world;
  };

  test('moving a shared stop re-routes every line through it and keeps every train', () => {
    const w = twoLines();
    const s1 = at(w, 't1').seconds;
    const s2 = at(w, 't2').seconds;
    const next = reduce(w, { type: 'move', id: 'shared', x: 1500, y: 1500, now });
    expect(stopOf(next, 'shared')).toMatchObject({ x: 1500, y: 1500 });
    expect(legSeconds(trackRoute(trackOf(next, 't2'), byId(next)), 0)).toBeGreaterThan(
      legSeconds(trackRoute(trackOf(w, 't2'), byId(w)), 0),
    );
    expect(at(next, 't1').seconds).toBeCloseTo(s1);
    expect(at(next, 't2').seconds).toBeCloseTo(s2);
  });

  test('dragging a shared stop behind one line\'s train and back keeps both trains', () => {
    const w = twoLines();
    const keep = { t1: at(w, 't1').seconds, t2: at(w, 't2').seconds };
    // Pulled behind t2's train, t2's leg is shorter than its offset and it waits.
    const pulled = reduce(w, { type: 'move', id: 'shared', x: 200, y: 600, now, keep });
    expect(at(pulled, 't2')).toMatchObject({ waiting: true });
    const back = reduce(pulled, { type: 'move', id: 'shared', x: 1500, y: 600, now, keep });
    expect(at(back, 't1').seconds).toBeCloseTo(keep.t1);
    expect(at(back, 't2').seconds).toBeCloseTo(keep.t2);
    expect(trackOf(back, 't2').train).toEqual(trackOf(w, 't2').train);
  });

  test('completing a shared stop that is next on both lines sends both trains on', () => {
    const w = done(twoLines(), 'dentist');
    trackOf(w, 't1').train = { leg: 1, departedAt: 0 };
    const next = reduce(w, { type: 'complete', trackId: 't1', now });
    expect(stopOf(next, 'shared').done).toBe(true);
    expect(trackOf(next, 't1').train).toEqual({ leg: 2, departedAt: now });
    expect(trackOf(next, 't2').train).toEqual({ leg: 1, departedAt: now });
  });

  test('completing a shared stop that is further ahead on the other line leaves that train be', () => {
    const w = twoLines();
    const next = reduce(w, { type: 'complete', trackId: 't2', now });
    expect(stopOf(next, 'shared').done).toBe(true);
    expect(trackOf(next, 't1').train).toEqual({ leg: 0, departedAt: 0 });
    expect(trackOf(next, 't2').train).toEqual({ leg: 1, departedAt: now });
  });

  test('complete skips a done stop ahead of the train and completes the first undone one', () => {
    const w = done(twoLines(), 'dentist', 'shared');
    trackOf(w, 't1').train = { leg: 1, departedAt: now };
    const next = reduce(w, { type: 'complete', trackId: 't1', now });
    expect(stopOf(next, 'wristband').done).toBe(true);
    expect(trackOf(next, 't1').train).toEqual({ leg: 3, departedAt: now });
  });

  test('deleting a line keeps its shared stops on the other line', () => {
    const next = reduce(twoLines(), { type: 'delete', id: 'goal2', now });
    expect(next.tracks.map((t) => t.id)).toEqual(['t1']);
    expect(next.tracks[0].stops).toEqual(['dentist', 'shared', 'wristband']);
    expect(next.stops.map((s) => s.id)).toEqual(['dentist', 'wristband', 'shared']);
  });

  test('deleting a shared stop removes it from every line', () => {
    const w = twoLines();
    const s2 = at(w, 't2').seconds;
    const next = reduce(w, { type: 'delete', id: 'shared', now });
    expect(trackOf(next, 't1').stops).toEqual(['dentist', 'wristband']);
    expect(trackOf(next, 't2').stops).toEqual(['goal2']);
    expect(next.stops.map((s) => s.id)).toEqual(['dentist', 'wristband', 'goal2']);
    expect(at(next, 't2')).toMatchObject({ leg: 0 });
    expect(at(next, 't2').seconds).toBeCloseTo(s2);
  });

  test('deleting a stop a train passed through merges from the derived leg', () => {
    // t1 passed through shared, done from t2, and is 100 s into the leg to wristband.
    const w = done(twoLines(), 'dentist', 'shared');
    trackOf(w, 't2').train = { leg: 1, departedAt: 0 };
    const leg1 = legSeconds(trackRoute(trackOf(w, 't1'), byId(w)), 1);
    trackOf(w, 't1').train = { leg: 1, departedAt: now - (leg1 + 100) * 1000 };
    const before = at(w, 't1');
    expect(before.leg).toBe(2);
    const next = reduce(w, { type: 'delete', id: 'shared', now });
    expect(trackOf(next, 't1').stops).toEqual(['dentist', 'wristband']);
    expect(at(next, 't1').leg).toBe(1);
    expect(at(next, 't1').seconds).toBeCloseTo(before.seconds + leg1);
  });

  test('undo on a shared stop is refused unless every line can take it back', () => {
    const late = 100_000_000;
    // t1 rolled through shared and is waiting at wristband: shared is the dot just behind its
    // derived train, so undo takes both trains back to waiting at shared.
    const passed = done(twoLines(), 'dentist', 'shared');
    trackOf(passed, 't1').train = { leg: 1, departedAt: 0 };
    trackOf(passed, 't2').train = { leg: 1, departedAt: 0 };
    expect(trainState(trackOf(passed, 't1'), byId(passed), late)).toMatchObject({ leg: 2, waiting: true });
    const rolled = reduce(passed, { type: 'undo', stopId: 'shared', now: late });
    expect(stopOf(rolled, 'shared').done).toBe(false);
    expect(trainState(trackOf(rolled, 't1'), byId(rolled), late)).toMatchObject({ leg: 1, waiting: true });
    expect(trainState(trackOf(rolled, 't2'), byId(rolled), late)).toMatchObject({ leg: 0, waiting: true });
    // t1 parked past wristband: shared is two behind its train, so undo is refused.
    const far = done(twoLines(), 'dentist', 'shared', 'wristband');
    trackOf(far, 't1').train = { leg: 3, departedAt: 0 };
    trackOf(far, 't2').train = { leg: 1, departedAt: 0 };
    expect(reduce(far, { type: 'undo', stopId: 'shared', now })).toBe(far);
    // t1 just past shared: both trains go back to waiting at it.
    const just = done(twoLines(), 'dentist', 'shared');
    trackOf(just, 't1').train = { leg: 2, departedAt: now };
    trackOf(just, 't2').train = { leg: 1, departedAt: now };
    const back = reduce(just, { type: 'undo', stopId: 'shared', now });
    expect(stopOf(back, 'shared').done).toBe(false);
    expect(at(back, 't1')).toMatchObject({ leg: 1, waiting: true });
    expect(at(back, 't2')).toMatchObject({ leg: 0, waiting: true });
  });

  test('undo puts back the stop pressed, judged against every derived train', () => {
    // Shared done from t2, then Dentist from t1; t1 has since rolled through Shared to Wristband.
    let w = reduce(twoLines(), { type: 'complete', trackId: 't2', now });
    w = reduce(w, { type: 'complete', trackId: 't1', now });
    const late = 100_000_000;
    expect(trainState(trackOf(w, 't1'), byId(w), late)).toMatchObject({ leg: 2, waiting: true });
    // Dentist is two behind t1's derived train: it cannot be put back, and nothing else is.
    expect(undoable(w, 'dentist', late)).toBe(false);
    expect(reduce(w, { type: 'undo', stopId: 'dentist', now: late })).toBe(w);
    // Shared is the dot just behind on both lines: it comes back, and only it.
    expect(undoable(w, 'shared', late)).toBe(true);
    const back = reduce(w, { type: 'undo', stopId: 'shared', now: late });
    expect(stopOf(back, 'shared').done).toBe(false);
    expect(stopOf(back, 'dentist').done).toBe(true);
    expect(trainState(trackOf(back, 't1'), byId(back), late)).toMatchObject({ leg: 1, waiting: true });
    expect(trainState(trackOf(back, 't2'), byId(back), late)).toMatchObject({ leg: 0, waiting: true });
    expect(back.lastTouched).toBe('t1');
    // A pending or unknown stop is never undoable.
    expect(undoable(w, 'wristband', late)).toBe(false);
    expect(undoable(w, 'nope', late)).toBe(false);
  });

  test('keepTrain rebases from the derived leg', () => {
    // Dentist was done from elsewhere; the stored train lags on leg 0, but 1500 s have passed.
    const w = done(fixtureRunning(), 'dentist');
    const later = 1_500_000;
    const before = trainState(w.tracks[0], byId(w), later);
    expect(before.leg).toBe(1);
    const next = reduce(w, { type: 'moveGoal', trackId: 't1', x: 4000, y: 0, now: later });
    expect(next.tracks[0].train.leg).toBe(1);
    expect(trainState(next.tracks[0], byId(next), later).seconds).toBeCloseTo(before.seconds);
    expect(stopOf(next, 'dentist')).toMatchObject({ x: 1000, y: 0 });
  });

  test('dragging a goal scales a shared stop and keeps the other line its train', () => {
    const w = twoLines();
    const T = at(w, 't1').at;
    const s2 = at(w, 't2').seconds;
    const keep = { t1: at(w, 't1').seconds, t2: s2 };
    const next = reduce(w, { type: 'moveGoal', trackId: 't1', x: T.x + 2 * (3000 - T.x), y: 0, now, keep });
    expect(stopOf(next, 'shared').x).toBeCloseTo(T.x + 2 * (1500 - T.x));
    expect(stopOf(next, 'shared').y).toBeCloseTo(1200);
    expect(at(next, 't2').seconds).toBeCloseTo(s2);
    expect(at(next, 't1').seconds).toBeCloseTo(keep.t1);
  });
});

describe('join and leave', () => {
  const at = (world: World, id: string) => trainState(world.tracks.find((t) => t.id === id)!, byId(world), now);
  const trackOf = (world: World, id: string) => world.tracks.find((t) => t.id === id)!;

  /** fixtureRunning() and a second line t2 below it, straight from the origin to Goal 2. */
  function withT2(): World {
    const w = fixtureRunning();
    w.tracks.push({ id: 't2', color: 1, origin: { x: 0, y: 600 }, stops: ['goal2'], train: { leg: 0, departedAt: 0 }, target: 'goal' });
    w.stops.push(stop('goal2', 'square', 3000, 600));
    return w;
  }

  /** fixtureRunning() and the day line through Dentist and Wristband. */
  function withDay(): World {
    const w = fixtureRunning();
    w.tracks.push({
      id: 'day',
      color: 2,
      origin: { x: 0, y: -600 },
      stops: ['dentist', 'wristband'],
      train: { leg: 0, departedAt: 0 },
      target: 'next',
      day: { date: '2026-11-01', budgets: [3600, 3600], lengths: [3600, 7200] },
    });
    return w;
  }

  test('join puts a stop on a second line at the snap point', () => {
    const w = withT2();
    const s1 = at(w, 't1').seconds;
    const s2 = at(w, 't2').seconds;
    const next = reduce(w, { type: 'join', trackId: 't2', stopId: 'dentist', leg: 0, x: 1500, y: 600, now });
    expect(trackOf(next, 't2').stops).toEqual(['dentist', 'goal2']);
    expect(trackOf(next, 't1').stops).toEqual(['dentist', 'wristband']);
    expect(stopOf(next, 'dentist')).toMatchObject({ x: 1500, y: 600 });
    expect(next.stops.filter((s) => s.id === 'dentist')).toHaveLength(1);
    // t1's leg to Dentist grew with the move; both trains keep the seconds they had covered.
    expect(at(next, 't1')).toMatchObject({ leg: 0 });
    expect(at(next, 't1').seconds).toBeCloseTo(s1);
    expect(at(next, 't2')).toMatchObject({ leg: 0 });
    expect(at(next, 't2').seconds).toBeCloseTo(s2);
    expect(next.lastTouched).toBe('t2');
  });

  test('join is refused on the same line, behind the train or for a done stop', () => {
    const w = withT2();
    const join = (world: World, trackId: string, stopId: string, leg: number) =>
      reduce(world, { type: 'join', trackId, stopId, leg, x: 1500, y: 600, now });
    // Already on the line.
    expect(join(w, 't1', 'dentist', 0)).toBe(w);
    // Past the end: leg 1 would put it after Goal 2, last on the line.
    expect(join(w, 't2', 'dentist', 1)).toBe(w);
    // A square never goes last; before another line's goal it may be a step.
    expect(join(w, 't2', 'wristband', 1)).toBe(w);
    expect(join(w, 't2', 'wristband', 0)).not.toBe(w);
    // Done.
    const done: World = { ...w, stops: w.stops.map((s) => (s.id === 'dentist' ? { ...s, done: true } : s)) };
    expect(join(done, 't2', 'dentist', 0)).toBe(done);
    // Behind the derived train: t2 has passed through Shared, done elsewhere, onto leg 1.
    const two = twoLines();
    two.stops = two.stops.map((s) => (s.id === 'shared' ? { ...s, done: true } : s));
    const late = 2_000_000;
    expect(trainState(trackOf(two, 't2'), byId(two), late).leg).toBe(1);
    expect(reduce(two, { type: 'join', trackId: 't2', stopId: 'dentist', leg: 0, x: 500, y: 600, now: late })).toBe(two);
    // Never the day line, and never an unknown track or stop.
    const day = withDay();
    trackOf(day, 'day').stops = ['wristband'];
    expect(reduce(day, { type: 'join', trackId: 'day', stopId: 'dentist', leg: 0, x: 500, y: -600, now })).toBe(day);
    expect(join(w, 'nope', 'dentist', 0)).toBe(w);
    expect(join(w, 't2', 'nope', 0)).toBe(w);
  });

  test('leave takes a stop off one line and off the world when it was its last', () => {
    const w = twoLines();
    const s2 = at(w, 't2').seconds;
    const off = reduce(w, { type: 'leave', trackId: 't2', stopId: 'shared', now });
    expect(trackOf(off, 't2').stops).toEqual(['goal2']);
    expect(trackOf(off, 't1').stops).toEqual(['dentist', 'shared', 'wristband']);
    expect(stopOf(off, 'shared')).toBeDefined();
    // The leg to Shared merges into the leg to Goal 2: same leg, same seconds.
    expect(at(off, 't2')).toMatchObject({ leg: 0 });
    expect(at(off, 't2').seconds).toBeCloseTo(s2);
    expect(off.lastTouched).toBe('t2');
    // Its last line: it leaves the world.
    const gone = reduce(off, { type: 'leave', trackId: 't1', stopId: 'shared', now });
    expect(trackOf(gone, 't1').stops).toEqual(['dentist', 'wristband']);
    expect(gone.stops.map((s) => s.id)).toEqual(['dentist', 'wristband', 'goal2']);
    // Not on the line, or an unknown line: nothing.
    expect(reduce(off, { type: 'leave', trackId: 't2', stopId: 'shared', now })).toBe(off);
    expect(reduce(off, { type: 'leave', trackId: 'nope', stopId: 'shared', now })).toBe(off);
  });

  test('leave is refused for a square on its home line', () => {
    const w = twoLines();
    trackOf(w, 't2').stops = ['wristband', 'shared', 'goal2'];
    // Wristband's home is t1, where it is last: no leaving that.
    expect(reduce(w, { type: 'leave', trackId: 't1', stopId: 'wristband', now })).toBe(w);
    expect(reduce(w, { type: 'leave', trackId: 't2', stopId: 'goal2', now })).toBe(w);
    // On t2 it is only a step, and leaves.
    const next = reduce(w, { type: 'leave', trackId: 't2', stopId: 'wristband', now });
    expect(trackOf(next, 't2').stops).toEqual(['shared', 'goal2']);
    expect(trackOf(next, 't1').stops).toEqual(['dentist', 'shared', 'wristband']);
  });

  test('leaving the last project line deletes the stop, off the day too', () => {
    const w = withDay();
    // Off the day only: t1 still keeps Dentist.
    const offDay = reduce(w, { type: 'leave', trackId: 'day', stopId: 'dentist', now });
    expect(trackOf(offDay, 'day').stops).toEqual(['wristband']);
    expect(trackOf(offDay, 't1').stops).toEqual(['dentist', 'wristband']);
    expect(stopOf(offDay, 'dentist')).toBeDefined();
    // Off t1, its only project: the day does not keep it.
    const gone = reduce(w, { type: 'leave', trackId: 't1', stopId: 'dentist', now });
    expect(trackOf(gone, 't1').stops).toEqual(['wristband']);
    expect(trackOf(gone, 'day').stops).toEqual(['wristband']);
    expect(gone.stops.map((s) => s.id)).toEqual(['wristband']);
  });

  test('a stop last on the day line leaving its project takes only itself off the day', () => {
    const w = withDay();
    trackOf(w, 'day').stops = ['wristband', 'dentist'];
    const gone = reduce(w, { type: 'leave', trackId: 't1', stopId: 'dentist', now });
    expect(gone.tracks.map((t) => t.id)).toEqual(['t1', 'day']);
    expect(trackOf(gone, 't1').stops).toEqual(['wristband']);
    expect(trackOf(gone, 'day').stops).toEqual(['wristband']);
    expect(gone.stops.map((s) => s.id)).toEqual(['wristband']);
  });
});

describe('the day line', () => {
  const trackOf = (world: World, id: string) => world.tracks.find((t) => t.id === id)!;
  const day = (world: World) => world.tracks.find((t) => t.day)!;
  const ids = (world: World) => world.stops.map((s) => s.id);
  const later = now + 100_000;
  const newDay = (world: World, stops: string[], extra: Partial<{ id: string; endId: string }> = {}) =>
    reduce(world, {
      type: 'newDay',
      id: extra.id ?? 'd',
      endId: extra.endId ?? 'e',
      origin: { x: 0, y: -500 },
      stops,
      end: { x: 2000, y: -500 },
      now,
      date: '2026-11-01',
    });
  const complete = (world: World, trackId: string, at = now) => reduce(world, { type: 'complete', trackId, now: at });

  test('newDay makes an ink line through pending stops in order with a budget for the first', () => {
    const w = twoLines();
    const next = newDay(w, ['shared', 'dentist']);
    const budget = timeLeftAny(w, 'shared', now);
    expect(budget).toBeGreaterThan(0);
    expect(trackOf(next, 'd')).toEqual({
      id: 'd',
      color: 0,
      origin: { x: 0, y: -500 },
      stops: ['shared', 'dentist', 'e'],
      train: { leg: 0, departedAt: now },
      target: 'goal',
      day: { date: '2026-11-01', budgets: [budget, 0, 0], lengths: [3600, 3600, 1800] },
    });
    expect(stopOf(next, 'e')).toEqual({ id: 'e', title: '', shape: 'square', size: 'small', x: 2000, y: -500, done: false });
    expect(next.lastTouched).toBe('d');
    // The project lines are not touched.
    expect(next.tracks[0]).toBe(w.tracks[0]);
    expect(next.tracks[1]).toBe(w.tracks[1]);
  });

  test('newDay drops done, unknown and repeated stops and makes nothing from none', () => {
    const w = twoLines();
    w.stops = w.stops.map((s) => (s.id === 'dentist' ? { ...s, done: true } : s));
    // A stop on no project line cannot be put on a day.
    w.stops.push(stop('loose', 'circle', 0, 0));
    const next = newDay(w, ['dentist', 'nope', 'shared', 'loose', 'shared', 'goal2']);
    expect(trackOf(next, 'd').stops).toEqual(['shared', 'goal2', 'e']);
    expect(trackOf(next, 'd').day!.budgets).toEqual([timeLeftAny(w, 'shared', now), 0, 0]);
    expect(newDay(w, ['dentist', 'nope', 'loose'])).toBe(w);
    expect(newDay(w, [])).toBe(w);
    // An end square id or track id already taken is refused.
    expect(newDay(w, ['shared'], { endId: 'goal2' })).toBe(w);
    expect(newDay(w, ['shared'], { id: 't1' })).toBe(w);
  });

  test('newDay replaces the day that was', () => {
    const w = fixtureDay();
    const next = newDay(w, ['goal2', 'dayEnd', 'dentist'], { id: 'd2', endId: 'e2' });
    expect(next.tracks.map((t) => t.id)).toEqual(['t1', 't2', 'd2']);
    expect(trackOf(next, 'd2').stops).toEqual(['goal2', 'dentist', 'e2']);
    expect(ids(next)).not.toContain('dayEnd');
    expect(ids(next)).toContain('e2');
  });

  test('completing a day stop on its project sends the day train on with a fresh budget', () => {
    const w = complete(fixtureDay(), 't1');
    expect(stopOf(w, 'dentist').done).toBe(true);
    expect(trackOf(w, 't1').train).toEqual({ leg: 1, departedAt: now });
    expect(day(w).train).toEqual({ leg: 1, departedAt: now });
    const budget = timeLeftAny(w, 'shared', now);
    expect(budget).toBeGreaterThan(0);
    expect(day(w).day!.budgets).toEqual([1000, budget, 0]);
    expect(w.lastTouched).toBe('t1');
  });

  test('completing on the day completes on the project', () => {
    const w = complete(fixtureDay(), 'day');
    expect(stopOf(w, 'dentist').done).toBe(true);
    expect(trackOf(w, 't1').train).toEqual({ leg: 1, departedAt: now });
    expect(trackOf(w, 't2').train).toEqual({ leg: 0, departedAt: 0 });
    expect(day(w).train).toEqual({ leg: 1, departedAt: now });
    expect(day(w).day!.budgets).toEqual([1000, timeLeftAny(w, 'shared', now), 0]);
    expect(w.lastTouched).toBe('day');
  });

  test('the end square has budget zero so the train is there as soon as the last stop is done', () => {
    const w = complete(complete(fixtureDay(), 'day'), 'day', later);
    // Shared was next on both projects, so both departed with the day.
    expect(trackOf(w, 't1').train).toEqual({ leg: 2, departedAt: later });
    expect(trackOf(w, 't2').train).toEqual({ leg: 1, departedAt: later });
    expect(day(w).train).toEqual({ leg: 2, departedAt: later });
    expect(day(w).day!.budgets[2]).toBe(0);
    expect(dayState(day(w), w, later)).toMatchObject({ leg: 2, waiting: true, fraction: 1 });
    // Tapping the square parks the day train and leaves the projects be.
    const parked = complete(w, 'day', later + 1000);
    expect(stopOf(parked, 'dayEnd').done).toBe(true);
    expect(day(parked).train.leg).toBe(3);
    expect(dayState(day(parked), parked, later + 1000).parked).toBe(true);
    expect(trackOf(parked, 't1')).toBe(trackOf(w, 't1'));
    expect(trackOf(parked, 't2')).toBe(trackOf(w, 't2'));
  });

  test('addToDay appends before the end and refuses done or repeated stops', () => {
    const w = fixtureDay();
    const next = reduce(w, { type: 'addToDay', dayId: 'day', stopId: 'goal2', now });
    expect(day(next).stops).toEqual(['dentist', 'shared', 'goal2', 'dayEnd']);
    expect(day(next).day!.budgets).toEqual([1000, 0, 0, 0]);
    expect(day(next).train).toEqual({ leg: 0, departedAt: 0 });
    expect(reduce(w, { type: 'addToDay', dayId: 'day', stopId: 'shared', now })).toBe(w);
    expect(reduce(w, { type: 'addToDay', dayId: 'day', stopId: 'dayEnd', now })).toBe(w);
    expect(reduce(w, { type: 'addToDay', dayId: 'day', stopId: 'nope', now })).toBe(w);
    const doneGoal = { ...w, stops: w.stops.map((s) => (s.id === 'goal2' ? { ...s, done: true } : s)) };
    expect(reduce(doneGoal, { type: 'addToDay', dayId: 'day', stopId: 'goal2', now })).toBe(doneGoal);
    const noDay = twoLines();
    expect(reduce(noDay, { type: 'addToDay', dayId: 'day', stopId: 'goal2', now })).toBe(noDay);
    // Added while the day train waits at the end square, it is the day's next stop: budget now.
    const atEnd = complete(complete(w, 'day'), 'day');
    const added = reduce(atEnd, { type: 'addToDay', dayId: 'day', stopId: 'goal2', now: later });
    expect(day(added).stops).toEqual(['dentist', 'shared', 'goal2', 'dayEnd']);
    expect(day(added).train).toEqual({ leg: 2, departedAt: later });
    const budget = timeLeftAny(added, 'goal2', later);
    expect(budget).toBeGreaterThan(0);
    expect(day(added).day!.budgets).toEqual([1000, timeLeftAny(complete(w, 'day'), 'shared', now), budget, 0]);
    // A finished day takes nothing more.
    const finished = complete(atEnd, 'day');
    expect(reduce(finished, { type: 'addToDay', dayId: 'day', stopId: 'goal2', now })).toBe(finished);
  });

  test('tick clears a day whose date has passed and leaves the projects alone', () => {
    const w = fixtureDay();
    const tomorrow = new Date(2026, 10, 2, 10).getTime();
    const next = reduce(w, { type: 'tick', now: tomorrow });
    expect(next.tracks.map((t) => t.id)).toEqual(['t1', 't2']);
    expect(next.tracks[0]).toBe(w.tracks[0]);
    expect(next.tracks[1]).toBe(w.tracks[1]);
    expect(ids(next)).toEqual(['dentist', 'wristband', 'shared', 'goal2']);
  });

  test('tick returns the same world when nothing changes', () => {
    const w = fixtureDay();
    expect(reduce(w, { type: 'tick', now: new Date(2026, 10, 1, 12).getTime() })).toBe(w);
    expect(reduce(w, { type: 'tick', now: new Date(2026, 10, 1, 23, 59).getTime() })).toBe(w);
    // Midnight is the turn of the day.
    expect(reduce(w, { type: 'tick', now: new Date(2026, 10, 2, 0, 0).getTime() })).not.toBe(w);
    const noDay = twoLines();
    expect(reduce(noDay, { type: 'tick', now: new Date(2026, 10, 9, 12).getTime() })).toBe(noDay);
  });

  test('a day stop done from its project before its turn is passed over when its turn comes, with the next budget written then', () => {
    // Day [A, B, C, end]: Dentist, Shared, Goal 2.
    const w = newDay(twoLines(), ['dentist', 'shared', 'goal2']);
    // B done from t2, where it is next; on the day it is further ahead, so the day train stays.
    const b = complete(w, 't2');
    expect(stopOf(b, 'shared').done).toBe(true);
    expect(day(b)).toBe(day(w));
    // A done: the day train passes B and sets off for C.
    const a = complete(b, 't1', later);
    expect(day(a).train).toEqual({ leg: 2, departedAt: later });
    const budget = timeLeftAny(a, 'goal2', later);
    expect(budget).toBeGreaterThan(0);
    expect(day(a).day!.budgets[2]).toBe(budget);
    expect(day(a).day!.budgets).toHaveLength(4);
  });

  test('undo of a day stop puts the day train back there with budget zero', () => {
    const w = complete(fixtureDay(), 'day');
    const back = reduce(w, { type: 'undo', stopId: 'dentist', now: later });
    expect(stopOf(back, 'dentist').done).toBe(false);
    expect(trainState(trackOf(back, 't1'), byId(back), later)).toMatchObject({ leg: 0, waiting: true });
    expect(day(back).train).toEqual({ leg: 0, departedAt: later });
    expect(day(back).day!.budgets[0]).toBe(0);
    expect(dayState(day(back), back, later)).toMatchObject({ leg: 0, waiting: true });
    expect(back.lastTouched).toBe('t1');
    // The day never blocks an undo: parked two past Shared, it still goes back to Shared's leg.
    const parked = complete(complete(w, 'day'), 'day');
    expect(day(parked).train.leg).toBe(3);
    const undone = reduce(parked, { type: 'undo', stopId: 'shared', now: later });
    expect(stopOf(undone, 'shared').done).toBe(false);
    expect(day(undone).train).toEqual({ leg: 1, departedAt: later });
    expect(day(undone).day!.budgets[1]).toBe(0);
    // The end square goes back to pending: only tapping it parks the day again.
    expect(stopOf(undone, 'dayEnd').done).toBe(false);
    expect(day(reduce(undone, { type: 'complete', trackId: 't2', now: later })).train.leg).toBe(2);
  });

  test('a day stop done on the day ahead of a project train can be put back', () => {
    // Shared first on the day: done there, t2 departs, but on t1 it is still ahead of the train.
    const w = complete(newDay(twoLines(), ['shared']), 'd', later);
    expect(stopOf(w, 'shared').done).toBe(true);
    expect(trackOf(w, 't1').train).toEqual({ leg: 0, departedAt: 0 });
    expect(undoable(w, 'shared', later)).toBe(true);
    const back = reduce(w, { type: 'undo', stopId: 'shared', now: later });
    expect(stopOf(back, 'shared').done).toBe(false);
    // t1 never passed it, so it is left alone; t2 waits at it again; so does the day.
    expect(trackOf(back, 't1')).toBe(trackOf(w, 't1'));
    expect(trainState(trackOf(back, 't2'), byId(back), later)).toMatchObject({ leg: 0, waiting: true });
    expect(day(back).train).toEqual({ leg: 0, departedAt: later });
    expect(day(back).day!.budgets[0]).toBe(0);
  });

  test('a one-stop day waits at its end square, whose budget is zero', () => {
    const w = complete(newDay(twoLines(), ['dentist']), 'd', later);
    expect(day(w).stops).toEqual(['dentist', 'e']);
    expect(day(w).train).toEqual({ leg: 1, departedAt: later });
    expect(day(w).day!.budgets).toEqual([timeLeftAny(twoLines(), 'dentist', now), 0]);
    expect(dayState(day(w), w, later)).toMatchObject({ leg: 1, waiting: true, fraction: 1 });
  });

  test('deleting a project goal takes its stops off the day unless another project has them', () => {
    const w = fixtureDay();
    const next = reduce(w, { type: 'delete', id: 'wristband', now });
    expect(next.tracks.map((t) => t.id)).toEqual(['t2', 'day']);
    expect(ids(next)).toEqual(['shared', 'goal2', 'dayEnd']);
    // The day train was heading for Dentist; it now heads for Shared on a fresh budget.
    expect(day(next).stops).toEqual(['shared', 'dayEnd']);
    expect(day(next).train).toEqual({ leg: 0, departedAt: now });
    const budget = timeLeftAny(next, 'shared', now);
    expect(budget).toBeGreaterThan(0);
    expect(day(next).day!.budgets).toEqual([budget, 0]);
    // Shared is still on t1, so deleting t2's goal leaves it on the day.
    const kept = reduce(w, { type: 'delete', id: 'goal2', now });
    expect(day(kept).stops).toEqual(['dentist', 'shared', 'dayEnd']);
    expect(day(kept).day!.budgets).toEqual([1000, 0, 0]);
  });

  test('a stop off the day takes its budget with it and keeps the rest aligned', () => {
    const w = fixtureDay();
    // Ahead of the day train; also the last pending stop before the end square, which may go.
    const ahead = reduce(w, { type: 'leave', trackId: 'day', stopId: 'shared', now });
    expect(day(ahead).stops).toEqual(['dentist', 'dayEnd']);
    expect(day(ahead).train).toEqual({ leg: 0, departedAt: 0 });
    expect(day(ahead).day!.budgets).toEqual([1000, 0]);
    // Behind it.
    const on = complete(w, 'day');
    const b1 = day(on).day!.budgets[1];
    const behind = reduce(on, { type: 'leave', trackId: 'day', stopId: 'dentist', now: later });
    expect(day(behind).stops).toEqual(['shared', 'dayEnd']);
    expect(day(behind).train.leg).toBe(0);
    expect(day(behind).day!.budgets).toEqual([b1, 0]);
    // The one it heads for: the following stop, on a fresh budget.
    const heading = reduce(w, { type: 'leave', trackId: 'day', stopId: 'dentist', now });
    expect(day(heading).stops).toEqual(['shared', 'dayEnd']);
    expect(day(heading).train).toEqual({ leg: 0, departedAt: now });
    expect(day(heading).day!.budgets).toEqual([timeLeftAny(heading, 'shared', now), 0]);
    // The end square itself stays.
    expect(reduce(w, { type: 'leave', trackId: 'day', stopId: 'dayEnd', now })).toBe(w);
  });

  test('a parked day train blocks neither delete nor leave, and drags never touch it', () => {
    const w = complete(complete(complete(fixtureDay(), 'day'), 'day'), 'day');
    expect(day(w).train.leg).toBe(3);
    const gone = reduce(w, { type: 'delete', id: 'shared', now: later });
    expect(ids(gone)).not.toContain('shared');
    expect(day(gone).stops).toEqual(['dentist', 'dayEnd']);
    expect(day(gone).train.leg).toBe(2);
    expect(day(gone).day!.budgets).toHaveLength(2);
    const left = reduce(w, { type: 'leave', trackId: 'day', stopId: 'shared', now: later });
    expect(day(left).stops).toEqual(['dentist', 'dayEnd']);
    expect(day(left).train.leg).toBe(2);
    // Moving a stop on the day re-routes the day line but leaves its train as stored.
    const fresh = fixtureDay();
    const moved = reduce(fresh, { type: 'move', id: 'shared', x: 1800, y: 700, now });
    expect(day(moved).train).toBe(day(fresh).train);
    expect(day(moved).day).toBe(day(fresh).day);
  });

  test('deleting the end square clears the day, and clearDay leaves the stops as they are', () => {
    const w = complete(fixtureDay(), 'day');
    const cleared = reduce(w, { type: 'clearDay', dayId: 'day', now });
    expect(cleared.tracks.map((t) => t.id)).toEqual(['t1', 't2']);
    expect(ids(cleared)).toEqual(['dentist', 'wristband', 'shared', 'goal2']);
    expect(stopOf(cleared, 'dentist').done).toBe(true);
    expect(cleared.lastTouched).toBeNull();
    expect(reduce(w, { type: 'delete', id: 'dayEnd', now })).toEqual(cleared);
    expect(reduce(cleared, { type: 'clearDay', dayId: 'day', now })).toBe(cleared);
  });

  test('moveDayEnd moves the end square alone; move still refuses it', () => {
    const w = fixtureDay();
    const next = reduce(w, { type: 'moveDayEnd', dayId: 'day', x: 2500, y: 1200, now });
    expect(stopOf(next, 'dayEnd')).toMatchObject({ x: 2500, y: 1200 });
    for (const id of ['dentist', 'wristband', 'shared', 'goal2']) expect(stopOf(next, id)).toBe(stopOf(w, id));
    expect(next.tracks).toBe(w.tracks);
    expect(reduce(w, { type: 'move', id: 'dayEnd', x: 2500, y: 1200, now })).toBe(w);
    const noDay = twoLines();
    expect(reduce(noDay, { type: 'moveDayEnd', dayId: 'day', x: 0, y: 0, now })).toBe(noDay);
  });
});

describe('moveOrigin', () => {
  test('moves the start, and a train on the first leg keeps its seconds', () => {
    const before = running();
    const was = trainState(before.tracks[0], byId(before), now);
    const after = reduce(before, { type: 'moveOrigin', trackId, x: -1000, y: 0, now });
    expect(after.tracks[0].origin).toEqual({ x: -1000, y: 0 });
    expect(after.stops).toEqual(before.stops);
    const is = trainState(after.tracks[0], byId(after), now);
    expect(is.leg).toBe(0);
    expect(is.seconds).toBeCloseTo(was.seconds, 6);
    expect(legSeconds(trackRoute(after.tracks[0], byId(after)), 0)).toBe(2000);
  });

  test('past the first stop the start is history: it moves and nothing else changes', () => {
    const before = running();
    before.stops[0].done = true;
    before.tracks[0].train = { leg: 1, departedAt: 0 };
    const after = reduce(before, { type: 'moveOrigin', trackId, x: 0, y: -500, now });
    expect(after.tracks[0].origin).toEqual({ x: 0, y: -500 });
    expect(after.tracks[0].train).toEqual(before.tracks[0].train);
  });

  test('an unknown track is ignored', () => {
    const before = running();
    expect(reduce(before, { type: 'moveOrigin', trackId: 'nope', x: 1, y: 1, now })).toBe(before);
  });
});

describe('moveGroup', () => {
  test('a whole line moves as a picture: every leg keeps its time and the train its place', () => {
    const before = running();
    const was = trainState(before.tracks[0], byId(before), now);
    const shift = (p: { x: number; y: number }) => ({ x: p.x + 100, y: p.y - 50 });
    const after = reduce(before, {
      type: 'moveGroup',
      stops: Object.fromEntries(before.stops.map((s) => [s.id, shift(s)])),
      origins: { [trackId]: shift(before.tracks[0].origin) },
      now,
    });
    expect(after.tracks[0].origin).toEqual({ x: 100, y: -50 });
    expect(after.stops.map((s) => [s.x, s.y])).toEqual([
      [1100, -50],
      [1100, 950],
      [3100, 950],
    ]);
    expect(total(after)).toBeCloseTo(total(before), 6);
    const is = trainState(after.tracks[0], byId(after), now);
    expect(is.seconds).toBeCloseTo(was.seconds, 6);
    expect(is.at).toEqual(shift(was.at));
  });

  test('a goal in the group translates and never scales, and a leg half in stretches with the train kept', () => {
    const before = running();
    const was = trainState(before.tracks[0], byId(before), now);
    const after = reduce(before, {
      type: 'moveGroup',
      stops: { b: { x: 1000, y: 2000 }, g: { x: 3000, y: 2000 } },
      origins: {},
      now,
    });
    expect(after.stops.find((s) => s.id === 'a')).toMatchObject({ x: 1000, y: 0 });
    expect(after.stops.find((s) => s.id === 'g')).toMatchObject({ x: 3000, y: 2000 });
    expect(trainState(after.tracks[0], byId(after), now).seconds).toBeCloseTo(was.seconds, 6);
  });

  test('a done stop moves too, and the train behind a moved leg keeps its place on every line', () => {
    const before = twoLines();
    before.stops[0].done = true;
    before.tracks[0].train = { leg: 1, departedAt: 0 };
    const was = before.tracks.map((t) => trainState(t, byId(before), now));
    const after = reduce(before, {
      type: 'moveGroup',
      stops: { dentist: { x: 1000, y: 300 }, shared: { x: 1500, y: 900 } },
      origins: {},
      now,
    });
    expect(after.stops.find((s) => s.id === 'dentist')).toMatchObject({ x: 1000, y: 300, done: true });
    after.tracks.forEach((t, i) => expect(trainState(t, byId(after), now).seconds).toBeCloseTo(was[i].seconds, 6));
  });

  test('ids the world does not know are ignored, and an empty group is no change', () => {
    const before = running();
    expect(reduce(before, { type: 'moveGroup', stops: {}, origins: {}, now })).toBe(before);
    expect(
      reduce(before, { type: 'moveGroup', stops: { nope: { x: 0, y: 0 } }, origins: { nope: { x: 0, y: 0 } }, now }),
    ).toBe(before);
  });
});

describe('a goal picture', () => {
  test('edit sets a picture on a square, null takes it away key and all, and a circle never holds one', () => {
    const world = running();
    const withPicture = reduce(world, { type: 'edit', id: 'g', image: 'data:image/jpeg;base64,AAAA' });
    expect(withPicture.stops.find((s) => s.id === 'g')!.image).toBe('data:image/jpeg;base64,AAAA');
    // An edit that says nothing of the picture keeps it.
    const renamed = reduce(withPicture, { type: 'edit', id: 'g', title: 'Ship' });
    expect(renamed.stops.find((s) => s.id === 'g')).toMatchObject({ title: 'Ship', image: 'data:image/jpeg;base64,AAAA' });
    const without = reduce(renamed, { type: 'edit', id: 'g', image: null });
    expect('image' in without.stops.find((s) => s.id === 'g')!).toBe(false);
    const circle = reduce(world, { type: 'edit', id: 'a', image: 'data:image/jpeg;base64,AAAA' });
    expect('image' in circle.stops.find((s) => s.id === 'a')!).toBe(false);
  });
});

describe('a day line for each date', () => {
  const trackOf = (world: World, id: string) => world.tracks.find((t) => t.id === id)!;
  const at = (d: number, h: number, min = 0) => new Date(2026, 10, d, h, min).getTime();
  /** withWeek() moved on a week: Nov 6 running through Dentist and Shared, Nov 7 held with Goal 2, and a held Nov 9. */
  function week(): World {
    const w = withWeek();
    trackOf(w, 'day').day!.date = '2026-11-06';
    trackOf(w, 'day2').day!.date = '2026-11-07';
    w.tracks.push({
      id: 'day9',
      color: 4,
      origin: { x: 0, y: 1200 },
      stops: ['dayEnd9'],
      train: { leg: 0, departedAt: 0 },
      target: 'next',
      day: { date: '2026-11-09', budgets: [0], lengths: [1800], held: true },
    });
    w.stops.push({ id: 'dayEnd9', title: '', shape: 'square', size: 'small', x: 0, y: 1500, done: false });
    return w;
  }

  test("a tick just after midnight clears yesterday's day and keeps the days ahead", () => {
    const next = reduce(week(), { type: 'tick', now: at(7, 0, 1) });
    expect(next.tracks.map((t) => t.id)).toEqual(['t1', 't2', 'day2', 'day9']);
    expect(next.stops.map((s) => s.id)).not.toContain('dayEnd');
  });

  test("a tick on a held day's date begins it: its train sets off now on the project time left", () => {
    const tick = at(7, 0, 1);
    const next = reduce(week(), { type: 'tick', now: tick });
    const day = trackOf(next, 'day2');
    expect(day.day!.held).toBeUndefined();
    expect(day.train).toEqual({ leg: 0, departedAt: tick });
    expect(day.day!.budgets[0]).toBe(timeLeftAny(next, 'goal2', tick));
    expect(trackOf(next, 'day9').day!.held).toBe(true);
    // Ticking again changes nothing.
    expect(reduce(next, { type: 'tick', now: tick + 1000 })).toBe(next);
  });

  test("a held day's train waits at its start", () => {
    const w = week();
    const state = dayState(trackOf(w, 'day9'), w, at(7, 12));
    expect(state).toMatchObject({ leg: 0, waiting: true, parked: false, fraction: 0 });
    expect(state.at).toEqual(trackOf(w, 'day9').origin);
  });

  test("a stop on a held day done early leaves the day held; on its day it starts at the first pending stop", () => {
    const w = week();
    trackOf(w, 'day2').stops = ['shared', 'goal2', 'dayEnd2'];
    trackOf(w, 'day2').day = { date: '2026-11-07', budgets: [0, 0, 0], lengths: [3600, 7200, 1800], held: true };
    trackOf(w, 'day').stops = ['dentist', 'dayEnd'];
    trackOf(w, 'day').day = { date: '2026-11-06', budgets: [1000, 0], lengths: [3600, 1800] };
    const done = reduce(w, { type: 'complete', trackId: 't2', now: at(6, 12) });
    expect(stopOf(done, 'shared').done).toBe(true);
    expect(trackOf(done, 'day2')).toBe(trackOf(w, 'day2'));
    const tick = at(7, 8);
    const begun = reduce(done, { type: 'tick', now: tick });
    expect(trackOf(begun, 'day2').train).toEqual({ leg: 1, departedAt: tick });
    expect(trackOf(begun, 'day2').day!.budgets[1]).toBe(timeLeftAny(begun, 'goal2', tick));
  });

  test("drawing a day for one date leaves another date's day; drawing it again replaces only its own", () => {
    const w = week();
    const draw = (date: string, id: string, stops: string[]) =>
      reduce(w, { type: 'newDay', id, endId: `${id}-end`, origin: { x: 0, y: 0 }, stops, end: { x: 9, y: 9 }, now, date });
    const eighth = draw('2026-11-08', 'd8', ['wristband']);
    expect(eighth.tracks.map((t) => t.id)).toEqual(['t1', 't2', 'day', 'day2', 'day9', 'd8']);
    expect(trackOf(eighth, 'd8').day!.lengths).toEqual([7200, 1800]);
    const again = draw('2026-11-07', 'd7', ['wristband']);
    expect(again.tracks.map((t) => t.id)).toEqual(['t1', 't2', 'day', 'day9', 'd7']);
    expect(again.stops.map((s) => s.id)).not.toContain('dayEnd2');
  });

  test('drawing a day through a stop planned for another day takes it off that day', () => {
    const w = week();
    const next = reduce(w, { type: 'newDay', id: 'd8', endId: 'e8', origin: { x: 0, y: 0 }, stops: ['goal2'], end: { x: 9, y: 9 }, now, date: '2026-11-08' });
    expect(trackOf(next, 'd8').stops).toEqual(['goal2', 'e8']);
    // Nov 7 held nothing else, so it goes with its end square.
    expect(next.tracks.map((t) => t.id)).not.toContain('day2');
    expect(next.stops.map((s) => s.id)).not.toContain('dayEnd2');
  });

  test("deleting one day's end square clears that day only", () => {
    const next = reduce(week(), { type: 'delete', id: 'dayEnd2', now });
    expect(next.tracks.map((t) => t.id)).toEqual(['t1', 't2', 'day', 'day9']);
  });

  test("completing a stop settles the running day's train and leaves a held day alone", () => {
    const w = week();
    const next = reduce(w, { type: 'complete', trackId: 't1', now });
    expect(trackOf(next, 'day').train).toEqual({ leg: 1, departedAt: now });
    expect(trackOf(next, 'day2')).toBe(trackOf(w, 'day2'));
  });

  test('addToDay appends to the named day only, with the stop’s default length, and takes it off any other', () => {
    const w = week();
    const next = reduce(w, { type: 'addToDay', dayId: 'day2', stopId: 'shared', now });
    expect(trackOf(next, 'day2').stops).toEqual(['goal2', 'shared', 'dayEnd2']);
    expect(trackOf(next, 'day2').day!.lengths).toEqual([7200, 3600, 1800]);
    expect(trackOf(next, 'day').stops).toEqual(['dentist', 'dayEnd']);
    expect(trackOf(next, 'day').day!.lengths).toEqual([3600, 1800]);
  });
});

describe('when a stop was done', () => {
  test('completing a stop records when, undoing it takes that away, and a shared stop has one time', () => {
    const w = twoLines();
    const done = reduce(w, { type: 'complete', trackId: 't2', now: 7000 });
    expect(stopOf(done, 'shared').doneAt).toBe(7000);
    // Shared is also on t1, where it is further ahead: one stop, one time.
    expect(done.stops.filter((s) => s.doneAt !== undefined).map((s) => s.id)).toEqual(['shared']);
    const back = reduce(done, { type: 'undo', stopId: 'shared', now: 8000 });
    expect(stopOf(back, 'shared').done).toBe(false);
    expect('doneAt' in stopOf(back, 'shared')).toBe(false);
  });
});

/** withLife with Wristband back on its own line, at its own height: only Start and Far are on the life line. */
function ringless(): World {
  const w = withLife();
  w.stops = w.stops.map((s) => (s.id === 'wristband' ? { ...s, y: 0 } : s));
  w.tracks = w.tracks.map((t) => (t.life ? { ...t, stops: ['start', 'far'], life: { y: -800, budgets: [0, 0] } } : t));
  return w;
}

const lifeOf = (w: World) => w.tracks.find((t) => t.life)!;
const withDoneStops = (w: World, ...ids: string[]): World => ({ ...w, stops: w.stops.map((s) => (ids.includes(s.id) ? { ...s, done: true, doneAt: 1 } : s)) });
const setLifeTrain = (w: World, train: { leg: number; departedAt: number }, budgets?: number[]): World => ({
  ...w,
  tracks: w.tracks.map((t) => (t.life ? { ...t, train, life: { ...t.life, budgets: budgets ?? t.life.budgets } } : t)),
});

describe('join onto the life line', () => {
  test('a goal released right of the life train goes to the life height and into the stops by x', () => {
    const w = ringless();
    const next = reduce(w, { type: 'join', trackId: 'life', stopId: 'wristband', leg: 0, x: 3000, y: 77, now: 250_000 });
    expect(stopOf(next, 'wristband')).toMatchObject({ x: 3000, y: -800 });
    expect(lifeOf(next).stops).toEqual(['start', 'wristband', 'far']);
    expect(lifeOf(next).life!.budgets).toHaveLength(3);
    // The project's other stops stay where they were.
    expect(stopOf(next, 'dentist')).toEqual(stopOf(w, 'dentist'));
  });

  test('a goal released at or left of the life train is refused', () => {
    const w = ringless();
    // At 250 s the life train is half way along its 500 s leg to Start, at x = 250.
    expect(reduce(w, { type: 'join', trackId: 'life', stopId: 'wristband', leg: 0, x: 100, y: -800, now: 250_000 })).toBe(w);
  });

  test('a circle or a triangle is refused', () => {
    const w = ringless();
    expect(reduce(w, { type: 'join', trackId: 'life', stopId: 'dentist', leg: 0, x: 3000, y: -800, now: 250_000 })).toBe(w);
  });
});

describe('move on the life line', () => {
  test('a ring keeps the life height whatever y it is given, and only its project\'s last leg changes', () => {
    const w = withLife();
    const route = (world: World) => trackRoute(world.tracks[0], byId(world));
    const next = reduce(w, { type: 'move', id: 'wristband', x: 4000, y: 0, now });
    expect(stopOf(next, 'wristband')).toMatchObject({ x: 4000, y: -800 });
    expect(legSeconds(route(next), 0)).toBe(legSeconds(route(w), 0));
    expect(legSeconds(route(next), 1)).not.toBe(legSeconds(route(w), 1));
    for (const id of ['start', 'far', 'dentist']) expect(stopOf(next, id)).toEqual(stopOf(w, id));
  });

  test('a marker moved past its neighbour re-sorts the life stops', () => {
    const next = reduce(withLife(), { type: 'move', id: 'far', x: 2000, y: 5, now });
    expect(lifeOf(next).stops).toEqual(['start', 'far', 'wristband']);
    expect(stopOf(next, 'far').y).toBe(-800);
  });

  test('a square dragged between the life train and its target becomes what the train heads for, from the same place', () => {
    // Start done, the train just set off for Wristband on a budget of 42.
    const w = setLifeTrain(withDoneStops(withLife(), 'start'), { leg: 1, departedAt: now }, [0, 42, 0]);
    const stood = lifeState(lifeOf(w), w, now).at.x;
    const next = reduce(w, { type: 'move', id: 'far', x: 2000, y: -800, now });
    expect(lifeOf(next).stops).toEqual(['start', 'far', 'wristband']);
    expect(lifeOf(next).train.leg).toBe(1);
    expect(lifeOf(next).life!.budgets[1]).toBe(0);
    expect(lifeState(lifeOf(next), next, now).at.x).toBeCloseTo(stood, 3);
  });

  test('a pending square dropped at or left of the life train is refused', () => {
    const w = withLife();
    // At 250 s the train is at x = 250.
    expect(reduce(w, { type: 'move', id: 'far', x: 250, y: -800, now: 250_000 })).toBe(w);
    expect(reduce(w, { type: 'move', id: 'far', x: 100, y: -800, now: 250_000 })).toBe(w);
  });

  test('a pending square dropped left of the last done square is refused, right of it is not', () => {
    // Wristband is done out of order at x 3000 while the train still heads for Start.
    const w = withDoneStops(withLife(), 'wristband');
    expect(reduce(w, { type: 'move', id: 'far', x: 2000, y: -800, now: 250_000 })).toBe(w);
    expect(stopOf(reduce(w, { type: 'move', id: 'far', x: 3500, y: -800, now: 250_000 }), 'far').x).toBe(3500);
  });
});

describe('moveGroup on the life line', () => {
  test('life squares carried past each other are sorted by x and the train heads for the first undone one right of where it stood', () => {
    const w = setLifeTrain(withDoneStops(withLife(), 'start'), { leg: 1, departedAt: now }, [0, 42, 0]);
    const stood = lifeState(lifeOf(w), w, now).at.x;
    const next = reduce(w, { type: 'moveGroup', stops: { far: { x: 2000, y: -800 } }, origins: {}, now });
    expect(lifeOf(next).stops).toEqual(['start', 'far', 'wristband']);
    expect(lifeOf(next).train.leg).toBe(1);
    expect(lifeState(lifeOf(next), next, now).at.x).toBeCloseTo(stood, 3);
  });
});

describe('moveGoal on the life line', () => {
  test('a ring is moved by move, so moveGoal returns the same world', () => {
    const w = withLife();
    expect(reduce(w, { type: 'moveGoal', trackId: 't1', x: 4000, y: -800, now })).toBe(w);
  });
});

describe('addStop on the life line', () => {
  test('nothing is added to the life line alone: a square is refused past a parked train and on an empty line', () => {
    const parked = setLifeTrain(withDoneStops(withLife(), 'start', 'wristband', 'far'), { leg: 3, departedAt: 7 });
    expect(reduce(parked, { type: 'addStop', trackId: 'life', id: 'm', shape: 'square', leg: 3, x: 9000, y: 0, now })).toBe(parked);
    const empty: World = { tracks: [{ ...lifeOf(withLife()), stops: [], life: { y: -800, budgets: [] } }], stops: [], lastTouched: null };
    expect(reduce(empty, { type: 'addStop', trackId: 'life', id: 'm', shape: 'square', leg: 0, x: 100, y: 0, now })).toBe(empty);
  });

  test('a circle or a triangle is refused there, and a square is refused on a project line', () => {
    const w = withLife();
    expect(reduce(w, { type: 'addStop', trackId: 'life', id: 'c', shape: 'circle', leg: 0, x: 9000, y: 0, now })).toBe(w);
    expect(reduce(w, { type: 'addStop', trackId: 'life', id: 'tr', shape: 'triangle', leg: 0, x: 9000, y: 0, now })).toBe(w);
    expect(reduce(w, { type: 'addStop', trackId: 't1', id: 'sq', shape: 'square', leg: 0, x: 500, y: 0, now })).toBe(w);
  });

  test('a square dropped at or left of the life train is refused', () => {
    const w = withLife();
    expect(reduce(w, { type: 'addStop', trackId: 'life', id: 'm', shape: 'square', leg: 0, x: 100, y: 0, now: 250_000 })).toBe(w);
  });
});

describe('complete through the life line', () => {
  /** t1's train on its goal, Dentist done, the life train waiting at Start. */
  function ringReady(): World {
    const w = withDoneStops(withLife(), 'dentist');
    w.tracks = w.tracks.map((t) => (t.id === 't1' ? { ...t, train: { leg: 1, departedAt: now } } : t));
    return w;
  }

  test('a ring completed by its project leaves the life train waiting; tapping the marker then sends it past the ring', () => {
    const ringDone = reduce(ringReady(), { type: 'complete', trackId: 't1', now });
    expect(stopOf(ringDone, 'wristband').done).toBe(true);
    expect(lifeOf(ringDone).train.leg).toBe(0);
    expect(stopOf(ringDone, 'start').done).toBe(false);

    const markerDone = reduce(ringDone, { type: 'complete', trackId: 'life', now });
    expect(stopOf(markerDone, 'start').done).toBe(true);
    expect(lifeOf(markerDone).train).toEqual({ leg: 2, departedAt: now });
    // Rolling toward Far in real time: it has not arrived the moment it sets off.
    expect(lifeState(lifeOf(markerDone), markerDone, now)).toMatchObject({ leg: 2, waiting: false });
  });

  test('a ring is never completed through the life line, even when it is the life line\'s next', () => {
    const w = withDoneStops(setLifeTrain(withLife(), { leg: 1, departedAt: now }), 'start');
    expect(reduce(w, { type: 'complete', trackId: 'life', now })).toBe(w);
  });

  test('a bare marker that is next completes before the life train has arrived', () => {
    const w = withLife();
    const next = reduce(w, { type: 'complete', trackId: 'life', now: 100_000 });
    expect(stopOf(next, 'start')).toMatchObject({ done: true, doneAt: 100_000 });
  });

  test('a bare marker past the next square is not completed', () => {
    const w = withDoneStops(setLifeTrain(withLife(), { leg: 1, departedAt: now }), 'start');
    // The next square is the ring; Far, beyond it, stays undone.
    expect(reduce(w, { type: 'complete', trackId: 'life', now })).toBe(w);
    expect(stopOf(w, 'far').done).toBe(false);
  });
});

describe('delete with a life line', () => {
  test('deleting a project whose goal is a ring takes the square off the life line with it', () => {
    const w = withLife();
    const next = reduce(w, { type: 'delete', id: 'wristband', now });
    expect(next.tracks.map((t) => t.id)).toEqual(['life']);
    expect(lifeOf(next).stops).toEqual(['start', 'far']);
    expect(lifeOf(next).life!.budgets).toHaveLength(2);
    expect(next.stops.some((s) => s.id === 'wristband' || s.id === 'dentist')).toBe(false);
  });

  test('a done ring goes with its project too', () => {
    const w = withDoneStops(withLife(), 'dentist', 'wristband');
    const next = reduce(w, { type: 'delete', id: 'wristband', now });
    expect(lifeOf(next).stops).toEqual(['start', 'far']);
    expect(next.stops.some((s) => s.id === 'wristband')).toBe(false);
  });

  test('a ring the life train is heading for stays where the train stood', () => {
    const w = setLifeTrain(withDoneStops(withLife(), 'start'), { leg: 1, departedAt: now }, [0, 10_000, 0]);
    const later = now + 1000;
    const before = lifeState(lifeOf(w), w, later);
    const next = reduce(w, { type: 'delete', id: 'wristband', now: later });
    const after = lifeState(lifeOf(next), next, later);
    expect(after.at.x).toBeCloseTo(before.at.x, 3);
  });

  test('the square also leaves a day line that listed it', () => {
    const w = withLife();
    w.stops.push({ id: 'dayEnd', title: '', shape: 'square', size: 'small', x: 900, y: 900, done: false });
    w.tracks.push({
      id: 'day',
      color: 2,
      origin: { x: 1000, y: -400 },
      stops: ['dentist', 'wristband', 'dayEnd'],
      train: { leg: 0, departedAt: 0 },
      target: 'next',
      day: { date: '2026-11-01', budgets: [0, 0, 0], lengths: [3600, 3600, 1800] },
    });
    const next = reduce(w, { type: 'delete', id: 'wristband', now });
    expect(next.tracks.find((t) => t.id === 'day')!.stops).toEqual(['dayEnd']);
    expect(lifeOf(next).stops).not.toContain('wristband');
  });

  test('deleting the rightmost bare marker removes that square only, never the life line', () => {
    const w = withLife();
    const next = reduce(w, { type: 'delete', id: 'far', now });
    expect(lifeOf(next).stops).toEqual(['start', 'wristband']);
    expect(lifeOf(next).life!.budgets).toHaveLength(2);
    expect(next.stops.some((s) => s.id === 'far')).toBe(false);
    expect(next.tracks.map((t) => t.id)).toEqual(['t1', 'life']);
  });
});

describe('leave the life line', () => {
  test('a ring leaves the life line only and its project keeps it, from the middle of the line', () => {
    const w = withLife();
    const next = reduce(w, { type: 'leave', trackId: 'life', stopId: 'wristband', now });
    expect(lifeOf(next).stops).toEqual(['start', 'far']);
    expect(lifeOf(next).life!.budgets).toHaveLength(2);
    expect(next.tracks.find((t) => t.id === 't1')).toEqual(w.tracks[0]);
    expect(next.stops).toContainEqual(stopOf(w, 'wristband'));
  });

  test('a ring leaves from the last place on the life line too', () => {
    const w = withLife();
    w.stops = w.stops.map((s) => (s.id === 'wristband' ? { ...s, x: 6000 } : s));
    lifeOf(w).stops = ['start', 'far', 'wristband'];
    const next = reduce(w, { type: 'leave', trackId: 'life', stopId: 'wristband', now });
    expect(lifeOf(next).stops).toEqual(['start', 'far']);
    expect(next.tracks.find((t) => t.id === 't1')!.stops).toEqual(['dentist', 'wristband']);
  });
});

describe('not done on the life line', () => {
  test('a bare marker un-done sends the life train for it again, set off now', () => {
    const w = setLifeTrain(withDoneStops(withLife(), 'start'), { leg: 1, departedAt: 1000 });
    const next = reduce(w, { type: 'undo', stopId: 'start', now });
    expect(stopOf(next, 'start').done).toBe(false);
    expect(lifeOf(next).train).toEqual({ leg: 0, departedAt: now });
  });
});

describe('newTrack beside the life line', () => {
  test('colours by the project lines, so the life line does not shift the first colour', () => {
    const w: World = { tracks: [{ ...lifeOf(withLife()), stops: [], life: { y: -800, budgets: [] } }], stops: [], lastTouched: null };
    const next = reduce(w, { type: 'newTrack', id: 'p', goalId: 'g', title: '', origin: { x: 0, y: 0 }, now });
    expect(next.tracks.find((t) => t.id === 'p')!.color).toBe(0);
  });
});

describe('moveGroup keeps life squares on the life line', () => {
  test('carried squares go to the life height, whatever y the group gives them', () => {
    const next = reduce(withLife(), { type: 'moveGroup', stops: { far: { x: 6000, y: -300 } }, origins: {}, now });
    expect(stopOf(next, 'far')).toMatchObject({ x: 6000, y: -800 });
  });

  test('a group that would put a pending life square at or left of the life train moves nothing', () => {
    const w = withLife();
    // At 250 s the life train is half way along its leg to Start, at x = 250.
    const stops = { far: { x: 100, y: -800 }, dentist: { x: 1100, y: 0 } };
    expect(reduce(w, { type: 'moveGroup', stops, origins: {}, now: 250_000 })).toBe(w);
  });

  test('a group that would put a pending square left of the last done square moves nothing', () => {
    const w = withDoneStops(withLife(), 'start');
    expect(reduce(w, { type: 'moveGroup', stops: { far: { x: 400, y: -800 } }, origins: {}, now: 1000 })).toBe(w);
  });

  test('a group that carries the done squares along with it keeps the order it had', () => {
    const w = withDoneStops(withLife(), 'start');
    const next = reduce(w, { type: 'moveGroup', stops: { start: { x: 400, y: -800 }, far: { x: 4900, y: -800 } }, origins: {}, now: 1000 });
    expect(stopOf(next, 'far').x).toBe(4900);
    expect(stopOf(next, 'start').x).toBe(400);
  });
});

describe('the day takes no square the life line lists', () => {
  test('a day drawn through a ring or a marker is not made', () => {
    const w = withLife();
    expect(reduce(w, { type: 'newDay', id: 'd', endId: 'e', origin: { x: 0, y: 0 }, stops: ['wristband'], end: { x: 1, y: 1 }, now, date: '2026-11-01' })).toBe(w);
  });

  test('a ring is not added to a day, and a day drawn through a ring and a step keeps only the step', () => {
    const w = withLife();
    w.tracks.push({
      id: 'day',
      color: 2,
      origin: { x: 1000, y: -400 },
      stops: ['dentist', 'dayEnd'],
      train: { leg: 0, departedAt: 0 },
      target: 'next',
      day: { date: '2026-11-01', budgets: [1000, 0], lengths: [3600, 1800] },
    });
    w.stops.push({ id: 'dayEnd', title: '', shape: 'square', size: 'small', x: 1500, y: 900, done: false });
    expect(reduce(w, { type: 'addToDay', dayId: 'day', stopId: 'wristband', now })).toBe(w);
    const drawn = reduce(withLife(), { type: 'newDay', id: 'd', endId: 'e', origin: { x: 0, y: 0 }, stops: ['wristband', 'dentist'], end: { x: 1, y: 1 }, now, date: '2026-11-01' });
    expect(drawn.tracks.find((t) => t.id === 'd')!.stops).toEqual(['dentist', 'e']);
  });
});

describe('the life train keeps its place', () => {
  // Start done and Wristband, the project's goal, moved past Far: the life train runs the marker leg
  // from Start to Far on real time.
  const markerLeg = (): World => {
    const w = withDoneStops(withLife(), 'start');
    const moved: World = { ...w, stops: w.stops.map((s) => (s.id === 'wristband' ? { ...s, x: 6000 } : s)) };
    const reordered: World = { ...moved, tracks: moved.tracks.map((t) => (t.life ? { ...t, stops: ['start', 'far', 'wristband'] } : t)) };
    return setLifeTrain(reordered, { leg: 1, departedAt: 0 });
  };
  const trainX = (w: World, at: number) => lifeState(lifeOf(w), w, at).at.x;
  const at = 2_000_000;

  test('a ring moved between the life train and its marker becomes its target from where the train stood', () => {
    const w = markerLeg();
    const stood = trainX(w, at);
    const next = reduce(w, { type: 'move', id: 'wristband', x: 4000, y: -800, now: at });
    expect(lifeOf(next).stops).toEqual(['start', 'wristband', 'far']);
    expect(lifeOf(next).train.leg).toBe(1);
    expect(trainX(next, at)).toBeCloseTo(stood, 3);
  });

  test('the marker the life train heads for, dragged further out, leaves the train where it stood', () => {
    const w = markerLeg();
    const stood = trainX(w, at);
    const next = reduce(w, { type: 'move', id: 'far', x: 5800, y: -800, now: at });
    expect(lifeOf(next).train.leg).toBe(1);
    expect(trainX(next, at)).toBeCloseTo(stood, 3);
  });

  test('deleting the marker the life train heads for leaves the train where it stood', () => {
    const w = markerLeg();
    const stood = trainX(w, at);
    const next = reduce(w, { type: 'delete', id: 'far', now: at });
    expect(lifeOf(next).stops).toEqual(['start', 'wristband']);
    expect(trainX(next, at)).toBeCloseTo(stood, 3);
  });
});

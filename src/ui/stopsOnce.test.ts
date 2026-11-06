import { describe, expect, test } from 'vitest';
import type { StopView, TrackView } from '../plane/layout';
import { stopsOnce } from './stopsOnce';

function stopView(id: string, next: boolean): StopView {
  return { id, x: 0, y: 0, shape: 'square', size: 'medium', done: false, title: id, label: false, next, goal: false, projectGoal: false, terminus: false, ring: false, crowd: 0 };
}

function view(id: string, stops: StopView[]): TrackView {
  return { id, color: 0, finished: false, day: false, tomorrow: false, sketch: false, segments: [], behind: [], origin: { x: 0, y: 0 }, stops, train: { x: 0, y: 0, angle: 0, waiting: false, parked: false }, anyInView: true };
}

describe('stopsOnce', () => {
  test('a ring speaks for its project even when it is the life line\'s next and the project has an earlier step', () => {
    const project = view('t1', [stopView('step', true), stopView('ring', false)]);
    const life = view('life', [stopView('ring', true)]);
    const placed = stopsOnce([life, project], 'life');
    const ring = placed.find((p) => p.stop.id === 'ring')!;
    expect(ring.track).toBe('t1');
    expect(ring.stop.next).toBe(false);
  });

  test('a bare marker speaks for the life line', () => {
    const life = view('life', [stopView('marker', true)]);
    const marker = stopsOnce([life], 'life').find((p) => p.stop.id === 'marker')!;
    expect(marker.track).toBe('life');
    expect(marker.stop.next).toBe(true);
  });

  test('an interchange of two projects still speaks for the first line it is next on', () => {
    const a = view('a', [stopView('shared', false)]);
    const b = view('b', [stopView('shared', true)]);
    expect(stopsOnce([a, b], 'life').find((p) => p.stop.id === 'shared')!.track).toBe('b');
  });
});

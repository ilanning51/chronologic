import uiCss from '../styles/ui.css?raw';
import tokensCss from '../styles/tokens.css?raw';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { trainState } from '../model/train';
import { MAX_SCALE } from '../plane/camera';
import type { World } from '../model/types';
import { createStore } from '../store/store';
import { App } from './App';

window.innerWidth = 1000;
window.innerHeight = 800;

/** One running track: Dentist (a medium circle) then Wristband (a large square, the goal). */
export function running(): World {
  return {
    tracks: [
      {
        id: 't1',
        color: 0,
        origin: { x: 0, y: 0 },
        stops: ['dentist', 'wristband'],
        train: { leg: 0, departedAt: 0 },
        target: 'goal',
      },
    ],
    stops: [
      { id: 'dentist', title: 'Dentist', shape: 'circle', size: 'medium', x: 1000, y: 0, done: false },
      { id: 'wristband', title: 'Wristband', shape: 'square', size: 'large', x: 3000, y: 0, done: false },
    ],
    lastTouched: null,
  };
}

/** Long after the first leg: the train waits at Dentist, so the opening shows both stops. */
const WAITING = 2_000_000;

test('a seeded world draws its stops as shapes with labels and the train on the path', () => {
  render(<App store={createStore(running())} now={() => WAITING} />);
  expect(screen.getByRole('button', { name: 'Dentist, step, medium, next' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Wristband, goal, large' })).toBeInTheDocument();
  expect(document.querySelector('[data-train]')).toBeInTheDocument();
  expect(screen.getByText('Dentist')).toHaveClass('label');
});

test('a done stop is a dot and a finished track is muted', () => {
  const world = running();
  world.stops = world.stops.map((s) => ({ ...s, done: true }));
  world.tracks[0].train = { leg: 2, departedAt: 0 };
  render(<App store={createStore(world)} now={() => 500_000} />);
  const dentist = screen.getByRole('button', { name: /^Dentist, step, medium, done/ });
  expect(dentist.querySelector('.shape.dot')).toBeInTheDocument();
  const lines = document.querySelectorAll('svg.track line');
  expect(lines.length).toBeGreaterThan(0);
  for (const line of lines) expect((line as SVGLineElement).style.stroke).toBe('var(--muted)');
  expect(document.querySelector('[data-train]')).not.toHaveAttribute('data-target');
});

test('every stop has a centered 44 px hit target that paints nothing', () => {
  // jsdom does not lay out pseudo-elements, so read the rule itself.
  const rule = /\.stop::before\s*\{([^}]*)\}/.exec(uiCss)?.[1] ?? '';
  expect(rule).toMatch(/width:\s*var\(--tap\)/);
  expect(rule).toMatch(/height:\s*var\(--tap\)/);
  expect(rule).toMatch(/translate\(-50%, -50%\)/);
  expect(rule).not.toMatch(/background|border|outline|box-shadow/);
  expect(tokensCss).toMatch(/--tap:\s*44px/);
});

/** Flights are instant under reduced motion, so these tests need no timers. */
function reduceMotion() {
  window.matchMedia = ((query: string) => ({ matches: true, media: query })) as unknown as typeof window.matchMedia;
}

afterEach(() => {
  delete (window as { matchMedia?: unknown }).matchMedia;
});

const train = () => document.querySelector('[data-train]') as SVGElement;
const trainX = () => Number(/translate\(([-\d.e]+)px/.exec(train().style.transform)![1]);
const left = (name: RegExp) => parseFloat(screen.getByRole('button', { name }).style.left);
/** How far Dentist is ahead of the train on screen. */
const ahead = () => left(/^Dentist/) - trainX();

test('opening centres the soonest train', () => {
  reduceMotion();
  render(<App store={createStore(running())} now={() => 500_000} />);
  expect(Math.abs(trainX() - window.innerWidth / 2)).toBeLessThan(1);
});

test('tapping the train zooms to the motion scale and tapping again returns', () => {
  reduceMotion();
  // Nearly at Dentist, so the stop stays on screen at every zoom.
  render(<App store={createStore(running())} now={() => 980_000} />);
  const opening = ahead();
  expect(opening).toBeGreaterThan(0);
  const tap = () => {
    fireEvent.pointerDown(train(), { pointerId: 1, clientX: 500, clientY: 400 });
    fireEvent.pointerUp(train(), { pointerId: 1, clientX: 500, clientY: 400 });
  };
  act(tap);
  // The opening fits the 1000 s leg to a third of 1000 px, a scale of 1/3.
  expect(ahead() / opening).toBeCloseTo(MAX_SCALE / (1 / 3), 3);
  act(tap);
  expect(ahead()).toBeCloseTo(opening, 6);
});

/** A quick press and release on an element. */
function tapOn(el: Element) {
  fireEvent.pointerDown(el, { pointerId: 1, clientX: 500, clientY: 400 });
  fireEvent.pointerUp(el, { pointerId: 1, clientX: 500, clientY: 400 });
}

/** An AudioContext stand-in that counts the oscillators it is asked for. */
function fakeAudio() {
  const made = vi.fn();
  class FakeAudioContext {
    currentTime = 0;
    destination = {};
    createOscillator() {
      made();
      return { type: 'sine', frequency: { value: 0 }, connect: vi.fn(), start: vi.fn(), stop: vi.fn() };
    }
    createGain() {
      return { gain: { value: 0, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() }, connect: vi.fn() };
    }
  }
  vi.stubGlobal('AudioContext', FakeAudioContext);
  return made;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

test('tapping the next stop completes it and the train departs toward the following stop', () => {
  const NOW = 500_000;
  const store = createStore(running());
  render(<App store={store} now={() => NOW} />);
  act(() => tapOn(screen.getByRole('button', { name: /^Dentist/ })));
  expect(screen.getByRole('button', { name: /^Dentist.*done/ })).toBeInTheDocument();
  expect(store.getState().tracks[0].train).toEqual({ leg: 1, departedAt: NOW });
});

test('tapping a later stop does nothing', () => {
  const store = createStore(running());
  render(<App store={store} now={() => WAITING} />);
  const before = store.getState();
  act(() => tapOn(screen.getByRole('button', { name: /^Wristband/ })));
  expect(store.getState()).toBe(before);
});

test('the goal completion plays the chord and buzzes', () => {
  const oscillators = fakeAudio();
  const vibrate = vi.fn();
  vi.stubGlobal('navigator', { ...navigator, vibrate });
  const world = running();
  world.stops[0].done = true;
  world.tracks[0].train = { leg: 1, departedAt: 0 };
  const store = createStore(world);
  render(<App store={store} now={() => 3_000_000} />);
  act(() => tapOn(screen.getByRole('button', { name: /^Wristband/ })));
  expect(store.getState().tracks[0].train.leg).toBe(2);
  expect(oscillators).toHaveBeenCalledTimes(4); // one tone and three chord notes
  expect(vibrate).toHaveBeenCalledTimes(1);
});

test('a plain stop completion plays one tone and does not buzz', () => {
  const oscillators = fakeAudio();
  const vibrate = vi.fn();
  vi.stubGlobal('navigator', { ...navigator, vibrate });
  render(<App store={createStore(running())} now={() => 500_000} />);
  act(() => tapOn(screen.getByRole('button', { name: /^Dentist/ })));
  expect(oscillators).toHaveBeenCalledTimes(1);
  expect(vibrate).not.toHaveBeenCalled();
});

test('a long press on the most recent dot offers Not done, which puts the train back waiting there', () => {
  vi.useFakeTimers();
  const world = running();
  world.stops[0].done = true;
  world.tracks[0].train = { leg: 1, departedAt: 0 };
  const store = createStore(world);
  render(<App store={store} now={() => 500_000} />);
  const dentist = screen.getByRole('button', { name: /^Dentist.*done/ });
  fireEvent.pointerDown(dentist, { pointerId: 1, clientX: 500, clientY: 400 });
  act(() => {
    vi.advanceTimersByTime(600);
  });
  fireEvent.pointerUp(dentist, { pointerId: 1, clientX: 500, clientY: 400 });
  act(() => {
    screen.getByRole('button', { name: 'Not done' }).click();
  });
  const state = store.getState();
  expect(state.tracks[0].train.leg).toBe(0);
  const byId = new Map(state.stops.map((s) => [s.id, s]));
  expect(trainState(state.tracks[0], byId, 500_000).waiting).toBe(true);
  expect(screen.queryByRole('group', { name: 'Done stop' })).not.toBeInTheDocument();
});

test('a long press on a pending stop lets you rename it', () => {
  vi.useFakeTimers();
  const store = createStore(running());
  render(<App store={store} now={() => WAITING} />);
  const wristband = screen.getByRole('button', { name: /^Wristband/ });
  fireEvent.pointerDown(wristband, { pointerId: 1, clientX: 500, clientY: 400 });
  act(() => {
    vi.advanceTimersByTime(600);
  });
  fireEvent.pointerUp(wristband, { pointerId: 1, clientX: 500, clientY: 400 });
  fireEvent.change(screen.getByRole('textbox', { name: 'Stop title' }), { target: { value: 'Bracelet' } });
  expect(store.getState().stops.find((s) => s.id === 'wristband')?.title).toBe('Bracelet');
});

/** A finished track with its goal's editor open and the delete button on screen. */
function openGoalEditor() {
  vi.useFakeTimers();
  const world = running();
  world.stops = world.stops.map((s) => ({ ...s, done: true }));
  world.tracks[0].train = { leg: 2, departedAt: 0 };
  const store = createStore(world);
  render(<App store={store} now={() => 5_000_000} />);
  const goal = screen.getByRole('button', { name: /^Wristband.*done/ });
  fireEvent.pointerDown(goal, { pointerId: 1, clientX: 500, clientY: 400 });
  act(() => {
    vi.advanceTimersByTime(600);
  });
  fireEvent.pointerUp(goal, { pointerId: 1, clientX: 500, clientY: 400 });
  return { store, hold: screen.getByRole('button', { name: 'Hold to delete the line' }) };
}

test('holding delete on the goal dot past the hold time deletes the line and closes the editor', () => {
  const { store, hold } = openGoalEditor();
  fireEvent.pointerDown(hold, { pointerId: 2, clientX: 500, clientY: 700 });
  expect(hold).toHaveClass('holding');
  act(() => {
    vi.advanceTimersByTime(700);
  });
  expect(store.getState().tracks).toEqual([]);
  expect(screen.queryByRole('group', { name: 'Done stop' })).not.toBeInTheDocument();
});

test('letting go of delete early cancels: the line stays and the fill stops', () => {
  const { store, hold } = openGoalEditor();
  fireEvent.pointerDown(hold, { pointerId: 2, clientX: 500, clientY: 700 });
  act(() => {
    vi.advanceTimersByTime(300);
  });
  fireEvent.pointerUp(hold, { pointerId: 2, clientX: 500, clientY: 700 });
  expect(store.getState().tracks).toHaveLength(1);
  expect(screen.getByRole('button', { name: 'Hold to delete the line' })).not.toHaveClass('holding');
});

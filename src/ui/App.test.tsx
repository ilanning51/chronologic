import uiCss from '../styles/ui.css?raw';
import tokensCss from '../styles/tokens.css?raw';
import { StrictMode } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { dayOf } from '../model/days';
import { DEFAULT_GOAL_SECONDS } from '../model/reducer';
import { dayState, legSeconds, trackRoute, trainState } from '../model/train';
import { MAX_SCALE } from '../plane/camera';
import { formatSeconds, gridFor, UNITS } from '../plane/grid';
import { createStore } from '../store/store';
import { TRACK_WIDTH } from '../plane/world';
import { running, twoLines, withDay } from '../test/fixtures';
import { App } from './App';

window.innerWidth = 1000;
window.innerHeight = 800;

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
  // The whole track dims, dots and all.
  expect(dentist).toHaveClass('finished');
  expect(/\.stop\.finished \.shape\.dot\s*\{([^}]*)\}/.exec(uiCss)?.[1]).toMatch(/background:\s*var\(--muted\)/);
  const lines = document.querySelectorAll('svg.track line');
  expect(lines.length).toBeGreaterThan(0);
  for (const line of lines) expect((line as SVGLineElement).style.stroke).toBe('var(--muted)');
  expect(document.querySelector('[data-train]')).not.toHaveAttribute('data-target');
  expect(document.querySelector('[data-target="train"]')).not.toBeInTheDocument();
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

/** Presses on a stop 4 px off its centre, moves the finger by (dx, dy) and lets go. */
function dragStop(name: RegExp, dx: number, dy: number) {
  const el = screen.getByRole('button', { name });
  const x = parseFloat(el.style.left) + 4;
  const y = parseFloat(el.style.top);
  fireEvent.pointerDown(el, { pointerId: 1, clientX: x, clientY: y });
  fireEvent.pointerMove(el, { pointerId: 1, clientX: x + dx, clientY: y + dy });
  fireEvent.pointerUp(el, { pointerId: 1, clientX: x + dx, clientY: y + dy });
}

/** Screen pixels per world second, read from where the two stops are drawn. */
const scaleOnScreen = (apart = 2000) => (left(/^Wristband/) - left(/^Dentist/)) / apart;
const stopNamed = (store: ReturnType<typeof createStore>, id: string) => store.getState().stops.find((s) => s.id === id)!;

test('dragging a stop moves it in world seconds keeping the grip', () => {
  const store = createStore(running());
  render(<App store={store} now={() => WAITING} />);
  const scale = scaleOnScreen();
  act(() => dragStop(/^Dentist/, 50, 30));
  const dentist = stopNamed(store, 'dentist');
  expect(dentist.x).toBeCloseTo(1000 + 50 / scale, 6);
  expect(dentist.y).toBeCloseTo(30 / scale, 6);
});

test('dragging the goal scales the stops ahead of the train', () => {
  const NOW = 500_000;
  const world = running();
  world.stops[1].x = 1300; // close enough that both stops are on screen mid-leg
  const store = createStore(world);
  render(<App store={store} now={() => NOW} />);
  const before = new Map(store.getState().stops.map((s) => [s.id, s]));
  const at = trainState(store.getState().tracks[0], before, NOW).at;
  const scale = scaleOnScreen(300);
  act(() => dragStop(/^Wristband/, 100, 0));
  const dist = (id: string, byId: Map<string, { x: number; y: number }>) => byId.get(id)!.x - at.x;
  const after = new Map(store.getState().stops.map((s) => [s.id, s]));
  const goalFactor = dist('wristband', after) / dist('wristband', before);
  expect(goalFactor).toBeCloseTo((1300 - at.x + 100 / scale) / (1300 - at.x), 6);
  expect(goalFactor).toBeGreaterThan(1);
  expect(dist('dentist', after) / dist('dentist', before)).toBeCloseTo(goalFactor, 6);
});

test('a dot does not move', () => {
  const world = running();
  world.stops[0].done = true;
  world.tracks[0].train = { leg: 1, departedAt: 0 };
  const store = createStore(world);
  render(<App store={store} now={() => 500_000} />);
  const before = store.getState();
  act(() => dragStop(/^Dentist/, 50, 30));
  expect(store.getState()).toBe(before);
  expect(stopNamed(store, 'dentist')).toMatchObject({ x: 1000, y: 0 });
});

/** Opens the tray with the plus. */
const openTray = () => act(() => screen.getByRole('button', { name: 'Add' }).click());

/** Drags a tile to a screen point and lets go. */
function dragTile(name: string, to: { x: number; y: number }) {
  const tile = screen.getByRole('button', { name });
  fireEvent.pointerDown(tile, { pointerId: 1, clientX: 900, clientY: 740 });
  fireEvent.pointerMove(tile, { pointerId: 1, clientX: to.x, clientY: to.y });
  fireEvent.pointerUp(tile, { pointerId: 1, clientX: to.x, clientY: to.y });
}

/** The screen point halfway between Dentist and Wristband, a few pixels off the line. */
function midLeg(dy = 6) {
  const a = screen.getByRole('button', { name: /^Dentist/ });
  const b = screen.getByRole('button', { name: /^Wristband/ });
  return {
    x: (parseFloat(a.style.left) + parseFloat(b.style.left)) / 2,
    y: parseFloat(a.style.top) + dy,
  };
}

test('dragging a circle from the tray onto a track adds a stop there and opens the name field', () => {
  const store = createStore(running());
  render(<App store={store} now={() => WAITING} />);
  openTray();
  const target = midLeg();
  act(() => dragTile('Step', target));
  const state = store.getState();
  expect(state.tracks[0].stops).toHaveLength(3);
  const added = state.stops.find((s) => s.id === state.tracks[0].stops[1])!;
  expect(added).toMatchObject({ shape: 'circle', title: '' });
  expect(added.x).toBeCloseTo(2000, 3);
  expect(added.y).toBeCloseTo(0, 3);
  const field = screen.getByRole('textbox', { name: 'Stop title' });
  act(() => {
    fireEvent.change(field, { target: { value: 'Order ADS1298' } });
    fireEvent.keyDown(field, { key: 'Enter' });
  });
  expect(store.getState().stops.find((s) => s.id === added.id)?.title).toBe('Order ADS1298');
  expect(screen.queryByRole('textbox', { name: 'Stop title' })).not.toBeInTheDocument();
});

test('dropping a tile on empty paper adds nothing', () => {
  const store = createStore(running());
  render(<App store={store} now={() => WAITING} />);
  openTray();
  const before = store.getState();
  const at = midLeg(300);
  act(() => dragTile('Sub-goal', at));
  expect(store.getState()).toBe(before);
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
});

test('the new line tile makes a track with a goal thirty days out and names it', () => {
  const store = createStore(running());
  render(<App store={store} now={() => WAITING} />);
  openTray();
  act(() => tapOn(screen.getByRole('button', { name: 'New line' })));
  const { tracks, stops } = store.getState();
  expect(tracks).toHaveLength(2);
  const made = tracks[1];
  const goal = stops.find((s) => s.id === made.stops[0])!;
  expect(goal.x - made.origin.x).toBe(DEFAULT_GOAL_SECONDS);
  expect(goal.y).toBe(made.origin.y);
  const field = screen.getByRole('textbox', { name: 'Line name' });
  act(() => {
    fireEvent.change(field, { target: { value: 'Thesis' } });
    fireEvent.keyDown(field, { key: 'Enter' });
  });
  expect(store.getState().stops.find((s) => s.id === goal.id)?.title).toBe('Thesis');
  // The tray stays open.
  expect(screen.getByRole('button', { name: 'Step' })).toBeInTheDocument();
});

test('Escape on a new goal name removes the track', () => {
  const store = createStore(running());
  render(<App store={store} now={() => WAITING} />);
  openTray();
  act(() => tapOn(screen.getByRole('button', { name: 'New line' })));
  expect(store.getState().tracks).toHaveLength(2);
  act(() => {
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Line name' }), { key: 'Escape' });
  });
  expect(store.getState().tracks).toHaveLength(1);
  expect(screen.queryByRole('textbox', { name: 'Line name' })).not.toBeInTheDocument();
});

/** A long press on a stop, released, so its editor is open. */
function openEditorOn(name: RegExp) {
  const el = screen.getByRole('button', { name });
  fireEvent.pointerDown(el, { pointerId: 1, clientX: 500, clientY: 400 });
  act(() => {
    vi.advanceTimersByTime(600);
  });
  fireEvent.pointerUp(el, { pointerId: 1, clientX: 500, clientY: 400 });
}

test('size buttons set the size', () => {
  vi.useFakeTimers();
  const store = createStore(running());
  render(<App store={store} now={() => WAITING} />);
  openEditorOn(/^Dentist/);
  act(() => screen.getByRole('button', { name: 'Large' }).click());
  expect(stopNamed(store, 'dentist').size).toBe('large');
  expect(screen.getByRole('button', { name: 'Large' })).toHaveAttribute('aria-pressed', 'true');
});

test('delete on a stop removes it and merges the legs', () => {
  vi.useFakeTimers();
  const world = running();
  world.tracks[0].stops = ['dentist', 'mid', 'wristband'];
  world.stops = [
    { id: 'dentist', title: 'Dentist', shape: 'circle', size: 'medium', x: 1000, y: 0, done: false },
    { id: 'mid', title: 'Lab', shape: 'triangle', size: 'medium', x: 2000, y: 0, done: false },
    { id: 'wristband', title: 'Wristband', shape: 'circle', size: 'large', x: 3000, y: 0, done: false },
  ];
  const store = createStore(world);
  const total = () => {
    const s = store.getState();
    const route = trackRoute(s.tracks[0], new Map(s.stops.map((x) => [x.id, x])));
    return s.tracks[0].stops.reduce((sum, _id, leg) => sum + legSeconds(route, leg), 0);
  };
  const before = total();
  render(<App store={store} now={() => 500_000} />);
  openEditorOn(/^Lab/);
  act(() => screen.getByRole('button', { name: 'Delete' }).click());
  const state = store.getState();
  expect(state.stops.find((s) => s.id === 'mid')).toBeUndefined();
  expect(state.tracks[0].stops).toEqual(['dentist', 'wristband']);
  expect(total()).toBeCloseTo(before, 6);
  expect(screen.queryByRole('group', { name: 'Edit stop' })).not.toBeInTheDocument();
});

test('delete on the goal needs a completed hold; a short hold does nothing', () => {
  vi.useFakeTimers();
  const store = createStore(running());
  render(<App store={store} now={() => WAITING} />);
  openEditorOn(/^Wristband/);
  expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
  const hold = () => screen.getByRole('button', { name: 'Hold to delete the line' });
  fireEvent.pointerDown(hold(), { pointerId: 2, clientX: 500, clientY: 700 });
  act(() => {
    vi.advanceTimersByTime(300);
  });
  fireEvent.pointerUp(hold(), { pointerId: 2, clientX: 500, clientY: 700 });
  expect(store.getState().tracks).toHaveLength(1);
  fireEvent.pointerDown(hold(), { pointerId: 2, clientX: 500, clientY: 700 });
  act(() => {
    vi.advanceTimersByTime(700);
  });
  expect(store.getState().tracks).toEqual([]);
});

/** The goal moved far right; with the train mid-leg to Dentist, the opening camera leaves it off screen. */
function farGoal() {
  const world = running();
  world.stops[1].x = 1e6;
  return world;
}

test('a track whose goal is off screen shows a bubble naming it, and a tap cycles it to the next stop', () => {
  const store = createStore(farGoal());
  render(<App store={store} now={() => 500_000} />);
  const bubble = document.querySelector('[data-target="bubble"]')!;
  expect(bubble).toHaveAccessibleName(/^Wristband, goal/);
  expect((bubble as HTMLElement).style.transform).toContain('-100%');
  act(() => tapOn(bubble));
  expect(store.getState().tracks[0].target).toBe('next');
  expect(document.querySelector('[data-target="bubble"]')).not.toBeInTheDocument();
});

test('a long press on a bubble flies to its target', () => {
  vi.useFakeTimers();
  reduceMotion();
  render(<App store={createStore(farGoal())} now={() => 500_000} />);
  const bubble = document.querySelector('[data-target="bubble"]')!;
  fireEvent.pointerDown(bubble, { pointerId: 1, clientX: 500, clientY: 400 });
  act(() => {
    vi.advanceTimersByTime(600);
  });
  fireEvent.pointerUp(bubble, { pointerId: 1, clientX: 500, clientY: 400 });
  expect(Math.abs(left(/^Wristband/) - window.innerWidth / 2)).toBeLessThan(1);
});

/** The bare paper of the plane, which reads as no target at all. */
const paper = () => screen.getByRole('main', { name: 'The plane' });

test('a tap on paper while naming a new line keeps the line and saves what was typed', () => {
  const store = createStore(running());
  render(<App store={store} now={() => WAITING} />);
  openTray();
  act(() => tapOn(screen.getByRole('button', { name: 'New line' })));
  const goalId = store.getState().tracks[1].stops[0];
  fireEvent.change(screen.getByRole('textbox', { name: 'Line name' }), { target: { value: 'Thesis' } });
  // On a touchscreen the pointerup arrives before the browser blurs the field: no blur event here.
  act(() => tapOn(paper()));
  expect(store.getState().tracks).toHaveLength(2);
  expect(stopNamed(store, goalId).title).toBe('Thesis');
  expect(screen.queryByRole('textbox', { name: 'Line name' })).not.toBeInTheDocument();
});

test('dropping a second tile while a name field holds text saves the first title', () => {
  const store = createStore(running());
  render(<App store={store} now={() => WAITING} />);
  openTray();
  act(() => dragTile('Step', midLeg()));
  const first = store.getState().tracks[0].stops[1];
  fireEvent.change(screen.getByRole('textbox', { name: 'Stop title' }), { target: { value: 'Order parts' } });
  const a = left(/^Dentist/);
  const b = left(/^Wristband/);
  act(() => dragTile('Sub-goal', { x: a + (b - a) * 0.8, y: midLeg().y }));
  expect(store.getState().tracks[0].stops).toHaveLength(4);
  expect(stopNamed(store, first).title).toBe('Order parts');
  expect(screen.getByRole('textbox', { name: 'Stop title' })).toHaveValue('');
});

test('under strict mode a new name field stays open until it is answered', () => {
  const store = createStore(running());
  render(
    <StrictMode>
      <App store={store} now={() => WAITING} />
    </StrictMode>,
  );
  openTray();
  act(() => tapOn(screen.getByRole('button', { name: 'New line' })));
  const field = screen.getByRole('textbox', { name: 'Line name' });
  act(() => {
    fireEvent.change(field, { target: { value: 'Thesis' } });
    fireEvent.keyDown(field, { key: 'Enter' });
  });
  expect(stopNamed(store, store.getState().tracks[1].stops[0]).title).toBe('Thesis');
});

test('the next stop sits above its neighbours, so crowded hit targets give it the tap', () => {
  render(<App store={createStore(running())} now={() => WAITING} />);
  expect(screen.getByRole('button', { name: /^Dentist/ })).toHaveClass('next');
  expect(screen.getByRole('button', { name: /^Wristband/ })).not.toHaveClass('next');
  const rule = /\.stop\.next\s*\{([^}]*)\}/.exec(uiCss)?.[1] ?? '';
  expect(rule).toMatch(/z-index:\s*1/);
  // The world is its own stacking layer, so the raised stop stays under the HUD.
  expect(/\.world\s*\{([^}]*)\}/.exec(uiCss)?.[1]).toMatch(/isolation:\s*isolate/);
});

/** Presses on a stop 4 px off its centre, moves the finger through screen x positions and lets go at the last. */
function dragStopThrough(name: RegExp, xs: number[]) {
  const el = screen.getByRole('button', { name });
  const x = parseFloat(el.style.left) + 4;
  const y = parseFloat(el.style.top);
  fireEvent.pointerDown(el, { pointerId: 1, clientX: x, clientY: y });
  for (const to of xs) fireEvent.pointerMove(el, { pointerId: 1, clientX: to, clientY: y });
  fireEvent.pointerUp(el, { pointerId: 1, clientX: xs[xs.length - 1], clientY: y });
}

test('dragging the next stop behind the train and back leaves the train where it was', () => {
  const NOW = 500_000;
  const store = createStore(running());
  render(<App store={store} now={() => NOW} />);
  const seconds = () => {
    const s = store.getState();
    return trainState(s.tracks[0], new Map(s.stops.map((x) => [x.id, x])), NOW).seconds;
  };
  const before = seconds();
  const start = left(/^Dentist/) + 4;
  act(() => dragStopThrough(/^Dentist/, [trainX() - 30, start]));
  expect(stopNamed(store, 'dentist').x).toBeCloseTo(1000, 6);
  expect(seconds()).toBeCloseTo(before, 6);
});

test('dragging the goal through the train and beyond never collapses the stops ahead', () => {
  const NOW = 500_000;
  const world = running();
  world.stops[1].x = 1300;
  const store = createStore(world);
  render(<App store={store} now={() => NOW} />);
  const at = trainState(world.tracks[0], new Map(world.stops.map((s) => [s.id, s])), NOW).at;
  const start = left(/^Wristband/) + 4;
  // Over the train exactly, then well past where the goal began.
  act(() => dragStopThrough(/^Wristband/, [trainX() + 4, start + 100]));
  const goal = stopNamed(store, 'wristband');
  const k = (goal.x - at.x) / (1300 - at.x);
  expect(k).toBeGreaterThan(1);
  expect(stopNamed(store, 'dentist').x - at.x).toBeCloseTo(k * (1000 - at.x), 6);
});

test('a right click on a pending stop is a long press: the editor opens and nothing completes', () => {
  const store = createStore(running());
  render(<App store={store} now={() => WAITING} />);
  const dentist = screen.getByRole('button', { name: /^Dentist/ });
  fireEvent.pointerDown(dentist, { pointerId: 1, button: 2, clientX: 500, clientY: 400 });
  fireEvent.pointerUp(dentist, { pointerId: 1, button: 2, clientX: 500, clientY: 400 });
  expect(screen.getByRole('group', { name: 'Edit stop' })).toBeInTheDocument();
  expect(stopNamed(store, 'dentist').done).toBe(false);
  // The browser's own menu stays shut.
  expect(fireEvent.contextMenu(dentist)).toBe(false);
});

test('a rolling train has a 44 px hit target that paints nothing; a parked one has none', () => {
  render(<App store={createStore(running())} now={() => 500_000} />);
  const hit = document.querySelector('[data-target="train"]:not([data-train])')!;
  expect(hit).toHaveAttribute('width', '44');
  expect(hit).toHaveAttribute('height', '44');
  expect(hit).toHaveAttribute('fill', 'none');
  expect(hit).toHaveAttribute('pointer-events', 'all');
  expect(hit).toHaveAttribute('data-track', 't1');
});

test('the editor text buttons are a full tap tall', () => {
  const rule = /\.pill-text\s*\{([^}]*)\}/.exec(uiCss)?.[1] ?? '';
  expect(rule).toMatch(/height:\s*var\(--tap\)/);
});

/** Taps the train, whatever it is doing. */
const tapTrain = () =>
  act(() => {
    fireEvent.pointerDown(train(), { pointerId: 1, clientX: 500, clientY: 400 });
    fireEvent.pointerUp(train(), { pointerId: 1, clientX: 500, clientY: 400 });
  });

test('after the hand pans, the next tap on the train follows it again instead of flying back', () => {
  reduceMotion();
  render(<App store={createStore(running())} now={() => 980_000} />);
  const opening = ahead();
  tapTrain();
  act(() => {
    fireEvent.pointerDown(paper(), { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(paper(), { pointerId: 1, clientX: 160, clientY: 100 });
    fireEvent.pointerUp(paper(), { pointerId: 1, clientX: 160, clientY: 100 });
  });
  tapTrain();
  expect(ahead() / opening).toBeCloseTo(MAX_SCALE / (1 / 3), 3);
  expect(Math.abs(trainX() - window.innerWidth / 2)).toBeLessThan(1);
});

test('after the wheel zooms, the next tap on the train follows it again instead of flying back', () => {
  reduceMotion();
  render(<App store={createStore(running())} now={() => 980_000} />);
  const opening = ahead();
  tapTrain();
  act(() => {
    fireEvent.wheel(paper(), { deltaY: 100, clientX: 100, clientY: 100 });
  });
  tapTrain();
  expect(ahead() / opening).toBeCloseTo(MAX_SCALE / (1 / 3), 3);
});

test('no v1 leftovers remain in the stylesheets', () => {
  expect(uiCss).not.toMatch(/\.hud-capture|\.chip\b|bullets/);
  expect(tokensCss).not.toMatch(/--train-[lw]/);
});

// The time grid and the leg label: the two places a time is written on the plane.

test('the grid draws behind the world in squares of the unit the legend names', () => {
  render(<App store={createStore(running())} now={() => WAITING} />);
  const grid = gridFor(scaleOnScreen());
  const legend = screen.getByText(grid.label);
  expect(legend.closest('.legend')).toBeInTheDocument();
  const squares = document.querySelector<HTMLElement>('.grid')!;
  expect(squares).toBeInTheDocument();
  const [w, h] = squares.style.backgroundSize.split(' ').map(parseFloat);
  expect(w).toBeCloseTo(grid.px, 6);
  expect(h).toBeCloseTo(grid.px, 6);
  // The grid is the first thing in the world layer, so every track lies over it.
  expect(document.querySelector('.world')!.firstElementChild).toBe(squares);
});

/** The unit the legend names right now, as its place on the ladder. */
const legendUnit = () => UNITS.findIndex((u) => u.label === document.querySelector('.legend')!.textContent);

test('the grid steps to a smaller unit as the wheel zooms in, and back out again', () => {
  render(<App store={createStore(running())} now={() => WAITING} />);
  const before = legendUnit();
  expect(before).toBeGreaterThan(0);
  act(() => {
    fireEvent.wheel(paper(), { clientX: 500, clientY: 400, deltaY: -1000 });
  });
  expect(legendUnit()).toBeLessThan(before);
  act(() => {
    fireEvent.wheel(paper(), { clientX: 500, clientY: 400, deltaY: 1000 });
  });
  expect(legendUnit()).toBe(before);
});

/** The planned seconds of the leg that ends at a stop, read from the store. */
function legInto(store: ReturnType<typeof createStore>, stopId: string): number {
  const state = store.getState();
  const track = state.tracks[0];
  return legSeconds(trackRoute(track, new Map(state.stops.map((s) => [s.id, s]))), track.stops.indexOf(stopId));
}

test('while a stop is dragged the leg arriving at it shows its time, and it goes when let go', () => {
  const store = createStore(running());
  render(<App store={store} now={() => WAITING} />);
  expect(document.querySelector('.leg-time')).not.toBeInTheDocument();
  const el = screen.getByRole('button', { name: /^Dentist/ });
  const x = parseFloat(el.style.left) + 4;
  const y = parseFloat(el.style.top);
  act(() => {
    fireEvent.pointerDown(el, { pointerId: 1, clientX: x, clientY: y });
    fireEvent.pointerMove(el, { pointerId: 1, clientX: x + 50, clientY: y + 30 });
  });
  const label = document.querySelector<HTMLElement>('.leg-time')!;
  expect(label).toBeInTheDocument();
  expect(label.textContent).toBe(formatSeconds(legInto(store, 'dentist')));
  // It hangs beneath the stop, which has moved with the finger.
  const moved = screen.getByRole('button', { name: /^Dentist/ });
  expect(parseFloat(label.style.left)).toBeCloseTo(parseFloat(moved.style.left), 3);
  expect(parseFloat(label.style.top)).toBeGreaterThan(parseFloat(moved.style.top));
  act(() => fireEvent.pointerUp(el, { pointerId: 1, clientX: x + 50, clientY: y + 30 }));
  expect(document.querySelector('.leg-time')).not.toBeInTheDocument();
});

test('while the goal is dragged the label reads the leg into the goal', () => {
  const store = createStore(running());
  render(<App store={store} now={() => WAITING} />);
  const el = screen.getByRole('button', { name: /^Wristband/ });
  const x = parseFloat(el.style.left) + 4;
  const y = parseFloat(el.style.top);
  act(() => {
    fireEvent.pointerDown(el, { pointerId: 1, clientX: x, clientY: y });
    fireEvent.pointerMove(el, { pointerId: 1, clientX: x + 100, clientY: y });
  });
  expect(document.querySelector('.leg-time')!.textContent).toBe(formatSeconds(legInto(store, 'wristband')));
  act(() => fireEvent.pointerUp(el, { pointerId: 1, clientX: x + 100, clientY: y }));
});

test('a tile carried onto a line shows the time of the leg it would end, and nothing off the line', () => {
  const store = createStore(running());
  render(<App store={store} now={() => WAITING} />);
  openTray();
  const tile = screen.getByRole('button', { name: 'Step' });
  act(() => {
    fireEvent.pointerDown(tile, { pointerId: 1, clientX: 900, clientY: 740 });
    fireEvent.pointerMove(tile, { pointerId: 1, clientX: 500, clientY: 300 });
  });
  expect(document.querySelector('.leg-time')).not.toBeInTheDocument();
  const target = midLeg();
  act(() => fireEvent.pointerMove(tile, { pointerId: 1, clientX: target.x, clientY: target.y }));
  // Halfway along the 2000 s leg from Dentist: the new leg into the stop would be 1000 s.
  expect(document.querySelector('.leg-time')!.textContent).toBe(formatSeconds(1000));
  act(() => fireEvent.pointerUp(tile, { pointerId: 1, clientX: target.x, clientY: target.y }));
  expect(document.querySelector('.leg-time')).not.toBeInTheDocument();
});

/** The track svgs come in the order of the world's tracks. */
const trackSvg = (i: number) => document.querySelectorAll('svg.track')[i] as SVGSVGElement;
const strokes = (svg: SVGSVGElement) =>
  [...svg.querySelectorAll('line')].map((l) => [l.style.stroke, parseFloat(l.style.strokeWidth)]);
const trainFill = (svg: SVGSVGElement) => (svg.querySelector('[data-train]') as SVGElement).style.fill;
/** The body of the first rule whose selector is exactly this one. */
const cssRule = (selector: string) =>
  new RegExp(String.raw`^${selector.replace(/[.()[\]]/g, '\\$&')}\s*\{([^}]*)\}`, 'm').exec(uiCss)?.[1] ?? '';

test('a stop on two lines is one button', () => {
  render(<App store={createStore(twoLines())} now={() => WAITING} />);
  expect(screen.getAllByRole('button', { name: /^Shared/ })).toHaveLength(1);
});

test('a stop on two lines is drawn as a ring', () => {
  render(<App store={createStore(twoLines())} now={() => WAITING} />);
  const shape = screen.getByRole('button', { name: /^Shared/ }).querySelector('.shape')!;
  expect(shape).toHaveClass('shape', 'ring', 'circle', 'medium');
  // A stop on one line stays solid.
  expect(screen.getByRole('button', { name: /^Dentist/ }).querySelector('.shape')).not.toHaveClass('ring');
  // The paper centre is the same shape again, 4 px in, so the ink border is as thick as a line.
  const centre = cssRule('.shape.ring::after');
  expect(centre).toMatch(/inset:\s*4px/);
  expect(centre).toMatch(/background:\s*var\(--paper\)/);
  expect(cssRule('.shape.ring.circle::after')).toMatch(/border-radius:\s*50%/);
  expect(cssRule('.shape.ring.triangle::after')).toMatch(/clip-path:\s*polygon\(50% 0, 100% 100%, 0 100%\)/);
});

test('a done interchange is a plain dot', () => {
  const world = twoLines();
  world.stops.find((s) => s.id === 'shared')!.done = true;
  render(<App store={createStore(world)} now={() => WAITING} />);
  const shape = screen.getByRole('button', { name: /^Shared/ }).querySelector('.shape')!;
  expect(shape).toHaveClass('dot');
  expect(shape).not.toHaveClass('ring');
});

/** One line with only its goal: a sketch of a project, its train rolling toward the goal. */
function sketchOnly() {
  const world = running();
  world.tracks[0].stops = ['wristband'];
  world.stops = world.stops.filter((s) => s.id === 'wristband');
  return world;
}

test('a line with only its goal is a sketch at half width in the muted ink', () => {
  render(<App store={createStore(sketchOnly())} now={() => 500_000} />);
  const svg = trackSvg(0);
  expect(strokes(svg).length).toBeGreaterThan(0);
  for (const s of strokes(svg)) expect(s).toEqual(['var(--muted)', TRACK_WIDTH / 2]);
  expect(trainFill(svg)).toBe('var(--muted)');
  const goal = screen.getByRole('button', { name: /^Wristband/ });
  expect(goal).toHaveClass('sketch');
  expect(cssRule('.stop.sketch .shape')).toMatch(/background:\s*var\(--muted\)/);
});

/** withDay(), dated the day `now` falls in, so the tick on open keeps it. */
function dayOn(now: number) {
  const world = withDay();
  world.tracks.find((t) => t.day)!.day!.date = dayOf(now);
  return world;
}

test('the day line is ink', () => {
  render(<App store={createStore(dayOn(WAITING))} now={() => WAITING} />);
  const svg = trackSvg(2);
  expect(strokes(svg).length).toBeGreaterThan(0);
  for (const s of strokes(svg)) expect(s).toEqual(['var(--ink)', TRACK_WIDTH]);
  expect(trainFill(svg)).toBe('var(--ink)');
  // Its stops are rings; a project line keeps its colour.
  expect(screen.getByRole('button', { name: /^Dentist/ }).querySelector('.shape')).toHaveClass('ring');
  expect(strokes(trackSvg(0))[0][0]).not.toBe('var(--ink)');
});

test("the day's-end square is a small ink square, not a ring", () => {
  render(<App store={createStore(dayOn(WAITING))} now={() => WAITING} />);
  const end = document.querySelector('[data-id="dayEnd"]') as HTMLElement;
  expect(end.querySelector('.shape')!.className).toBe('shape square small');
  // Press and focus fill it with ink, not the day track's palette colour.
  expect(end.style.getPropertyValue('--track-color')).toBe('var(--ink)');
});

test('the soonest line fills its bubble', () => {
  const world = dayOn(500_000);
  // Every target off screen, so each line shows a bubble; the day line points at its end.
  for (const id of ['wristband', 'goal2', 'dayEnd']) world.stops.find((s) => s.id === id)!.x = 1e6;
  world.tracks[2].target = 'goal';
  render(<App store={createStore(world)} now={() => 500_000} />);
  const bubble = (track: string) => document.querySelector(`[data-target="bubble"][data-track="${track}"]`) as HTMLElement;
  // t1 is 500 s from Dentist, t2 1000 s from Shared.
  expect(bubble('t1')).toHaveClass('bubble', 'soonest');
  expect(bubble('day')).not.toHaveClass('soonest');
  expect(bubble('day').style.getPropertyValue('--track-color')).toBe('var(--ink)');
  const filled = cssRule('.bubble.soonest');
  expect(filled).toMatch(/background:\s*var\(--track-color\)/);
  expect(filled).toMatch(/color:\s*var\(--paper\)/);
  expect(cssRule('.bubble.soonest .shape')).toMatch(/background:\s*var\(--paper\)/);
});

/** Where a stop is drawn on screen. */
const at = (name: RegExp) => {
  const el = screen.getByRole('button', { name });
  return { x: parseFloat(el.style.left), y: parseFloat(el.style.top) };
};
/** The day's-end square's button. */
const dayEndButton = () => document.querySelector('[data-id="dayEnd"]') as HTMLElement | null;
/** The points of the ghost ink line, if one is drawn. */
const ghostPoints = () =>
  document
    .querySelector('svg.day-ghost polyline')
    ?.getAttribute('points')
    ?.split(' ')
    .map((p) => p.split(',').map(Number));
const dayIn = (store: ReturnType<typeof createStore>) => store.getState().tracks.find((t) => t.day);
const point = (x: number, y: number) => ({ pointerId: 1, clientX: x, clientY: y });
/** Goal 2 brought in to x 2000, so it is on screen at the opening. */
function nearGoal2<W extends ReturnType<typeof twoLines>>(world: W): W {
  world.stops.find((s) => s.id === 'goal2')!.x = 2000;
  return world;
}
/** Screen pixels per world second, read from Dentist and Shared, 500 s apart. */
const scaleNow = () => (at(/^Shared/).x - at(/^Dentist/).x) / 500;

test('dragging the sun through two stops on two lines draws the day through them in that order', () => {
  const store = createStore(nearGoal2(twoLines()));
  render(<App store={store} now={() => WAITING} />);
  openTray();
  const goal2 = at(/^Goal 2/);
  const dentist = at(/^Dentist/);
  const scale = scaleNow();
  const release = { x: dentist.x + 40, y: dentist.y + 80 };
  const sun = screen.getByRole('button', { name: 'Today' });
  act(() => {
    fireEvent.pointerDown(sun, point(900, 740));
    fireEvent.pointerMove(sun, point(goal2.x + 5, goal2.y));
    fireEvent.pointerMove(sun, point(dentist.x, dentist.y + 5));
    fireEvent.pointerMove(sun, point(release.x, release.y));
  });
  // The ghost runs from where the day will start, 120 px above the first stop, through each stop
  // in the order reached, to the finger: what is let go is what was drawn.
  const ghost = ghostPoints()!;
  const want = [[goal2.x, goal2.y - 120], [goal2.x, goal2.y], [dentist.x, dentist.y], [release.x, release.y]];
  expect(ghost).toHaveLength(want.length);
  ghost.forEach(([x, y], i) => {
    expect(x).toBeCloseTo(want[i][0], 3);
    expect(y).toBeCloseTo(want[i][1], 3);
  });
  expect(dayIn(store)).toBeUndefined();

  act(() => {
    fireEvent.pointerUp(sun, point(release.x, release.y));
  });
  expect(ghostPoints()).toBeUndefined();
  const day = dayIn(store)!;
  expect(day.stops.slice(0, -1)).toEqual(['goal2', 'dentist']);
  expect(day.day!.date).toBe(dayOf(WAITING));
  // The day's-end square sits under the finger; the origin hangs above the first stop.
  const end = stopNamed(store, day.stops[2]);
  expect(end.x).toBeCloseTo(1000 + 40 / scale, 3);
  expect(end.y).toBeCloseTo(80 / scale, 3);
  expect(day.origin.x).toBeCloseTo(2000, 6);
  expect(day.origin.y).toBeCloseTo(600 - 120 / scale, 3);
  for (const s of strokes(trackSvg(2))) expect(s[0]).toBe('var(--ink)');
});

test('before the sun collects a stop its ghost runs from the pick-up to the finger', () => {
  const store = createStore(twoLines());
  render(<App store={store} now={() => WAITING} />);
  openTray();
  const sun = screen.getByRole('button', { name: 'Today' });
  act(() => {
    fireEvent.pointerDown(sun, point(900, 740));
    fireEvent.pointerMove(sun, point(20, 20));
  });
  expect(ghostPoints()).toEqual([
    [900, 740],
    [20, 20],
  ]);
  act(() => fireEvent.pointerUp(sun, point(20, 20)));
});

test('the sun picked up over a stop does not collect it until the finger moves to it', () => {
  const store = createStore(nearGoal2(twoLines()));
  render(<App store={store} now={() => WAITING} />);
  openTray();
  const goal2 = at(/^Goal 2/);
  const sun = screen.getByRole('button', { name: 'Today' });
  act(() => {
    fireEvent.pointerDown(sun, point(goal2.x, goal2.y));
    fireEvent.pointerMove(sun, point(20, 20));
    fireEvent.pointerUp(sun, point(20, 20));
  });
  expect(dayIn(store)).toBeUndefined();
});

test('lifting the sun on the last stop it collected puts the end square below it, not on it', () => {
  const store = createStore(nearGoal2(twoLines()));
  render(<App store={store} now={() => WAITING} />);
  openTray();
  const scale = scaleNow();
  const goal2 = at(/^Goal 2/);
  const dentist = at(/^Dentist/);
  const sun = screen.getByRole('button', { name: 'Today' });
  act(() => {
    fireEvent.pointerDown(sun, point(900, 740));
    fireEvent.pointerMove(sun, point(goal2.x + 5, goal2.y));
    fireEvent.pointerMove(sun, point(dentist.x, dentist.y + 5));
    fireEvent.pointerUp(sun, point(dentist.x + 3, dentist.y + 5));
  });
  const day = dayIn(store)!;
  expect(day.stops.slice(0, -1)).toEqual(['goal2', 'dentist']);
  const end = stopNamed(store, day.stops[2]);
  expect(end.x).toBeCloseTo(1000, 6);
  expect(end.y).toBeCloseTo(120 / scale, 3);
});

test('lifting the sun with no stops draws nothing', () => {
  const store = createStore(twoLines());
  render(<App store={store} now={() => WAITING} />);
  openTray();
  const before = store.getState();
  act(() => dragTile('Today', { x: 20, y: 20 }));
  expect(store.getState()).toBe(before);
  expect(ghostPoints()).toBeUndefined();
  expect(document.querySelectorAll('svg.track')).toHaveLength(2);
});

test('drawing a new day replaces the old', () => {
  const store = createStore(nearGoal2(dayOn(WAITING)));
  render(<App store={store} now={() => WAITING} />);
  openTray();
  act(() => dragTile('Today', at(/^Goal 2/)));
  const days = store.getState().tracks.filter((t) => t.day);
  expect(days).toHaveLength(1);
  expect(days[0].id).not.toBe('day');
  expect(days[0].stops.slice(0, -1)).toEqual(['goal2']);
  expect(store.getState().stops.some((s) => s.id === 'dayEnd')).toBe(false);
  expect(dayEndButton()).toBeNull();
});

test('dragging the day end through a stop adds it and the end returns', () => {
  const store = createStore(nearGoal2(dayOn(WAITING)));
  render(<App store={store} now={() => WAITING} />);
  const end = dayEndButton()!;
  const from = { x: parseFloat(end.style.left) + 4, y: parseFloat(end.style.top) };
  const goal2 = at(/^Goal 2/);
  act(() => {
    fireEvent.pointerDown(end, point(from.x, from.y));
    fireEvent.pointerMove(end, point(goal2.x + 4, goal2.y));
  });
  // Its legs are not time, so no leg chip shows.
  expect(document.querySelector('.leg-time')).toBeNull();
  act(() => {
    fireEvent.pointerMove(end, point(goal2.x + 200, goal2.y + 100));
    fireEvent.pointerUp(end, point(goal2.x + 200, goal2.y + 100));
  });
  expect(dayIn(store)!.stops).toEqual(['dentist', 'shared', 'goal2', 'dayEnd']);
  expect(stopNamed(store, 'dayEnd')).toMatchObject({ x: 1500, y: 900 });
  // The stop passed through stays where it was, on its own line.
  expect(stopNamed(store, 'goal2')).toMatchObject({ x: 2000, y: 600 });
  expect(store.getState().tracks.find((t) => t.id === 't2')!.stops).toEqual(['shared', 'goal2']);
});

test('dragging the day end elsewhere moves it alone and scales nothing', () => {
  const store = createStore(dayOn(WAITING));
  render(<App store={store} now={() => WAITING} />);
  const scale = scaleNow();
  const others = store.getState().stops.filter((s) => s.id !== 'dayEnd');
  const end = dayEndButton()!;
  const from = { x: parseFloat(end.style.left) + 4, y: parseFloat(end.style.top) };
  act(() => {
    fireEvent.pointerDown(end, point(from.x, from.y));
    fireEvent.pointerMove(end, point(from.x + 30, from.y + 60));
  });
  expect(document.querySelector('.leg-time')).toBeNull();
  act(() => {
    fireEvent.pointerUp(end, point(from.x + 30, from.y + 60));
  });
  const moved = stopNamed(store, 'dayEnd');
  expect(moved.x).toBeCloseTo(1500 + 30 / scale, 3);
  expect(moved.y).toBeCloseTo(900 + 60 / scale, 3);
  expect(store.getState().stops.filter((s) => s.id !== 'dayEnd')).toEqual(others);
  expect(dayIn(store)!.stops).toEqual(['dentist', 'shared', 'dayEnd']);
});

test('a day from yesterday is cleared on open', () => {
  const NOW = new Date(2026, 10, 2, 5).getTime();
  const store = createStore(withDay());
  render(<App store={store} now={() => NOW} />);
  expect(dayIn(store)).toBeUndefined();
  // The projects are untouched.
  expect(store.getState().tracks).toEqual(twoLines().tracks);
  expect(store.getState().stops).toEqual(twoLines().stops);
  expect(dayEndButton()).toBeNull();
  for (const svg of document.querySelectorAll('svg.track')) {
    for (const s of strokes(svg as SVGSVGElement)) expect(s[0]).not.toBe('var(--ink)');
  }
});

test('tapping the next stop on the day completes it on its project too', () => {
  const store = createStore(dayOn(WAITING));
  render(<App store={store} now={() => WAITING} />);
  act(() => tapOn(screen.getByRole('button', { name: /^Dentist/ })));
  expect(stopNamed(store, 'dentist').done).toBe(true);
  const track = (id: string) => store.getState().tracks.find((t) => t.id === id)!;
  expect(track('t1').train).toEqual({ leg: 1, departedAt: WAITING });
  expect(track('day').train).toEqual({ leg: 1, departedAt: WAITING });
});

test('a day still open as the clock passes 4 am is cleared on the next tick', () => {
  vi.useFakeTimers();
  let t = WAITING;
  const store = createStore(dayOn(WAITING));
  render(<App store={store} now={() => t} />);
  expect(dayIn(store)).toBeDefined();
  t = WAITING + 2 * 86_400_000;
  act(() => {
    vi.advanceTimersByTime(60_000);
  });
  expect(dayIn(store)).toBeUndefined();
  expect(dayEndButton()).toBeNull();
});

test('tapping a shared stop completes it on the line where it is next', () => {
  const store = createStore(twoLines());
  render(<App store={store} now={() => WAITING} />);
  // Shared is t2's next stop; t1 is still waiting at Dentist.
  act(() => tapOn(screen.getByRole('button', { name: /^Shared/ })));
  expect(stopNamed(store, 'shared').done).toBe(true);
  const track = (id: string) => store.getState().tracks.find((t) => t.id === id)!;
  expect(track('t2').train).toEqual({ leg: 1, departedAt: WAITING });
  expect(track('t1').train).toEqual({ leg: 0, departedAt: 0 });
});

const trackStops = (store: ReturnType<typeof createStore>, id: string) =>
  store.getState().tracks.find((t) => t.id === id)!.stops;

test('releasing a dragged stop on another line joins it there as a ring', () => {
  const store = createStore(twoLines());
  render(<App store={store} now={() => WAITING} />);
  const scale = scaleNow();
  // Down onto t2's second leg, Shared to Goal 2, a few pixels off its path.
  act(() => dragStop(/^Dentist/, 1250 * scale, 600 * scale + 6));
  expect(trackStops(store, 't2')).toEqual(['shared', 'dentist', 'goal2']);
  expect(trackStops(store, 't1')).toEqual(['dentist', 'shared', 'wristband']);
  // It sits at the snap point, on t2's path.
  expect(stopNamed(store, 'dentist').x).toBeCloseTo(2250, 3);
  expect(stopNamed(store, 'dentist').y).toBeCloseTo(600, 3);
  expect(screen.getByRole('button', { name: /^Dentist/ }).querySelector('.shape')).toHaveClass('ring');
});

test('dragging through a line without releasing on it does not join', () => {
  const store = createStore(twoLines());
  render(<App store={store} now={() => WAITING} />);
  const scale = scaleNow();
  const el = screen.getByRole('button', { name: /^Dentist/ });
  const x = parseFloat(el.style.left) + 4;
  const y = parseFloat(el.style.top);
  act(() => {
    fireEvent.pointerDown(el, point(x, y));
    fireEvent.pointerMove(el, point(x + 1250 * scale, y + 600 * scale));
    fireEvent.pointerMove(el, point(x + 1250 * scale, y + 1200 * scale));
    fireEvent.pointerUp(el, point(x + 1250 * scale, y + 1200 * scale));
  });
  expect(trackStops(store, 't2')).toEqual(['shared', 'goal2']);
  expect(stopNamed(store, 'dentist').y).toBeCloseTo(1200, 3);
});

/** running() and a line t2 `gap` s under it the whole way, its train waiting at its first stop as t1's is. */
function underneath(gap: number) {
  const world = running();
  world.tracks.push({
    id: 't2',
    color: 1,
    origin: { x: 0, y: gap },
    stops: ['near', 'goal2'],
    train: { leg: 0, departedAt: 0 },
    target: 'goal',
  });
  world.stops.push(
    { id: 'near', title: 'Near', shape: 'circle', size: 'medium', x: 1000, y: gap, done: false },
    { id: 'goal2', title: 'Goal 2', shape: 'square', size: 'large', x: 3000, y: gap, done: false },
  );
  return world;
}

test('dragging a goal onto another line does not join it', () => {
  const store = createStore(underneath(600));
  render(<App store={store} now={() => WAITING} />);
  const scale = scaleOnScreen();
  // Wristband, t1's goal, down onto t2's second leg.
  act(() => dragStop(/^Wristband/, -750 * scale, 600 * scale + 6));
  expect(stopNamed(store, 'wristband').y).toBeCloseTo(600 + 6 / scale, 3);
  expect(trackStops(store, 't2')).toEqual(['near', 'goal2']);
});

test('a tile dropped where two lines meet is added to both', () => {
  const store = createStore(underneath(40));
  render(<App store={store} now={() => WAITING} />);
  const scale = scaleOnScreen();
  expect(40 * scale).toBeLessThan(24); // both lines within SNAP_PX of the drop
  openTray();
  // 12 s under t1, so t1 is the nearest line and t2 is 28 s away.
  act(() => dragTile('Step', midLeg(12 * scale)));
  const t1 = trackStops(store, 't1');
  const t2 = trackStops(store, 't2');
  expect(t1).toHaveLength(3);
  expect(t2).toHaveLength(3);
  const id = t1[1];
  expect(t2[1]).toBe(id);
  // One stop, on both lines, so a ring.
  expect(store.getState().stops.filter((s) => s.id === id)).toHaveLength(1);
  // At the nearest line's snap point, on t1's path.
  expect(stopNamed(store, id).x).toBeCloseTo(2000, 3);
  expect(stopNamed(store, id).y).toBeCloseTo(0, 3);
  expect(document.querySelector(`[data-id="${id}"] .shape`)).toHaveClass('ring');
});

test('the editor shows a chip per line and leaving one removes the stop from it', () => {
  vi.useFakeTimers();
  // Goal 2 left untitled: its line's chip says so.
  const world = twoLines();
  world.stops.find((s) => s.id === 'goal2')!.title = '';
  const store = createStore(world);
  render(<App store={store} now={() => WAITING} />);
  openEditorOn(/^Shared/);
  const chips = screen.getAllByRole('button', { name: /^Leave / });
  expect(chips.map((c) => c.dataset.track)).toEqual(['t1', 't2']);
  expect(chips.map((c) => c.getAttribute('aria-label'))).toEqual(['Leave Wristband', 'Leave Unnamed']);
  act(() => chips[0].click());
  expect(trackStops(store, 't1')).toEqual(['dentist', 'wristband']);
  expect(trackStops(store, 't2')).toEqual(['shared', 'goal2']);
  // Still a stop, now on one line: the editor stays open, its chips gone.
  expect(screen.getByRole('group', { name: 'Edit stop' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /^Leave / })).not.toBeInTheDocument();
});

test('a stop on one line shows no chips', () => {
  vi.useFakeTimers();
  render(<App store={createStore(twoLines())} now={() => WAITING} />);
  openEditorOn(/^Dentist/);
  expect(screen.getByRole('group', { name: 'Edit stop' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /^Leave / })).not.toBeInTheDocument();
});

test("a goal on the day shows only the day's chip, in ink", () => {
  vi.useFakeTimers();
  const world = nearGoal2(dayOn(WAITING));
  world.tracks.find((t) => t.day)!.stops = ['dentist', 'goal2', 'dayEnd'];
  render(<App store={createStore(world)} now={() => WAITING} />);
  openEditorOn(/^Goal 2/);
  const chips = screen.getAllByRole('button', { name: /^Leave / });
  expect(chips.map((c) => c.dataset.track)).toEqual(['day']);
  expect(chips[0]).toHaveAccessibleName('Leave today');
  expect(chips[0].style.getPropertyValue('--track-color')).toBe('var(--ink)');
});

test('leaving the last project a stop is on deletes it and closes the editor', () => {
  vi.useFakeTimers();
  const store = createStore(dayOn(WAITING));
  render(<App store={store} now={() => WAITING} />);
  openEditorOn(/^Dentist/);
  act(() => (document.querySelector('.line-chip[data-track="t1"]') as HTMLElement).click());
  expect(store.getState().stops.some((s) => s.id === 'dentist')).toBe(false);
  expect(screen.queryByRole('group', { name: 'Edit stop' })).not.toBeInTheDocument();
});

test('a goal on a day that comes before its home still opens as a goal', () => {
  vi.useFakeTimers();
  const world = nearGoal2(dayOn(WAITING));
  const day = world.tracks.find((t) => t.day)!;
  day.stops = ['dentist', 'goal2', 'dayEnd'];
  // The day drawn before line t2 was made: it comes first in the world.
  world.tracks = [world.tracks[0], day, world.tracks[1]];
  const store = createStore(world);
  render(<App store={store} now={() => WAITING} />);
  openEditorOn(/^Goal 2/);
  const hold = screen.getByRole('button', { name: 'Hold to delete the line' });
  expect(screen.queryByRole('button', { name: 'Step' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
  // The hold deletes its home line, t2.
  fireEvent.pointerDown(hold, point(500, 700));
  act(() => {
    vi.advanceTimersByTime(700);
  });
  expect(store.getState().tracks.some((t) => t.id === 't2')).toBe(false);
  expect(store.getState().tracks.some((t) => t.id === 't1')).toBe(true);
});

test('a goal drawn for the day and let go on another line is not joined', () => {
  // t2's goal sits just under t1's second leg, and is the day's next stop, so it speaks for the day.
  const world = underneath(600);
  const goal2 = world.stops.find((s) => s.id === 'goal2')!;
  goal2.x = 2000;
  goal2.y = 20;
  world.tracks.push({
    id: 'day',
    color: 2,
    origin: { x: 1500, y: -400 },
    stops: ['goal2', 'near', 'dayEnd'],
    train: { leg: 0, departedAt: 0 },
    target: 'next',
    day: { date: dayOf(WAITING), budgets: [1000, 0, 0] },
  });
  world.stops.push({ id: 'dayEnd', title: '', shape: 'square', size: 'small', x: 1500, y: 900, done: false });
  const store = createStore(world);
  render(<App store={store} now={() => WAITING} />);
  expect(document.querySelector('[data-id="goal2"]')).toHaveAttribute('data-track', 'day');
  // It drags as t2's goal, along t1's path; the release must not join it there.
  act(() => dragStop(/^Goal 2/, 30, 0));
  expect(stopNamed(store, 'goal2').x).toBeGreaterThan(2000);
  expect(stopNamed(store, 'goal2').y).toBeCloseTo(20, 3);
  expect(trackStops(store, 't1')).toEqual(['dentist', 'wristband']);
});

test('a goal drawn for the day drags as its line goal, scaling the stops ahead', () => {
  // t2 waits at Near; Goal 2 is the day's next stop, so its button speaks for the day.
  const world = underneath(600);
  world.tracks[1].stops = ['near', 'mid', 'goal2'];
  world.stops.push({ id: 'mid', title: 'Mid', shape: 'circle', size: 'medium', x: 2000, y: 600, done: false });
  world.tracks.push({
    id: 'day',
    color: 2,
    origin: { x: 1500, y: -400 },
    stops: ['goal2', 'near', 'dayEnd'],
    train: { leg: 0, departedAt: 0 },
    target: 'next',
    day: { date: dayOf(WAITING), budgets: [1000, 0, 0] },
  });
  world.stops.push({ id: 'dayEnd', title: '', shape: 'square', size: 'small', x: 1500, y: 900, done: false });
  const store = createStore(world);
  render(<App store={store} now={() => WAITING} />);
  expect(document.querySelector('[data-id="goal2"]')).toHaveAttribute('data-track', 'day');
  act(() => dragStop(/^Goal 2/, 100, 0));
  const goal = stopNamed(store, 'goal2');
  const mid = stopNamed(store, 'mid');
  // Scaled from t2's train at Near (1000, 600): Mid keeps its share of the way to the goal.
  const factor = (goal.x - 1000) / 2000;
  expect(factor).toBeGreaterThan(1);
  expect((mid.x - 1000) / 1000).toBeCloseTo(factor, 6);
  expect(goal.y).toBeCloseTo(600, 6);
  expect(mid.y).toBeCloseTo(600, 6);
});

test('a long-waited stop shows a small crowd in the muted ink, at most five', () => {
  // The train reaches Dentist at 1000 s on a 1000 s leg: one more dot for every 1000 s it waits.
  const crowdAt = (now: number) => {
    const { unmount } = render(<App store={createStore(running())} now={() => now} />);
    const dentist = screen.getByRole('button', { name: /^Dentist/ });
    const crowd = dentist.querySelector('.crowd');
    const dots = crowd ? crowd.querySelectorAll('.dot').length : 0;
    const text = crowd?.textContent;
    // The crowd is a look, not news: the stop's name says nothing of it.
    expect(dentist).toHaveAccessibleName('Dentist, step, medium, next');
    // A stop the train has not waited at gathers no one.
    expect(screen.getByRole('button', { name: /^Wristband/ }).querySelector('.crowd')).toBeNull();
    unmount();
    return { crowd, dots, text };
  };
  const three = crowdAt(4_000_000);
  expect(three.crowd).toHaveAttribute('aria-hidden', 'true');
  expect(three.dots).toBe(3);
  expect(three.text).toBe('');
  expect(crowdAt(1_000_000_000).dots).toBe(5);
  // Half a leg-time in, no one yet.
  expect(crowdAt(1_500_000).crowd).toBeNull();
  // A row above-right of the stop, past its 44 px target, never in the way of a tap.
  const row = cssRule('.crowd');
  expect(row).toMatch(/left:\s*calc\(var\(--tap\) \/ 2 \+ 2px\)/);
  expect(row).toMatch(/bottom:\s*calc\(var\(--tap\) \/ 2 \+ 2px\)/);
  expect(row).toMatch(/pointer-events:\s*none/);
  // Dots of the dot size in the muted ink: no colour, no number.
  const dot = cssRule('.crowd .dot');
  expect(dot).toMatch(/width:\s*var\(--dot\)/);
  expect(dot).toMatch(/background:\s*var\(--muted\)/);
});

test('Not done puts back the stop pressed, and only a stop that can come back opens', () => {
  vi.useFakeTimers();
  // Shared done from t2, then Dentist from t1; t1 has rolled through Shared and waits at Wristband.
  const world = twoLines();
  for (const s of world.stops) if (s.id === 'dentist' || s.id === 'shared') s.done = true;
  world.tracks[0].train = { leg: 1, departedAt: 0 };
  world.tracks[1].train = { leg: 1, departedAt: 0 };
  const LATE = 100_000_000;
  const store = createStore(world);
  render(<App store={store} now={() => LATE} />);
  const before = store.getState();
  // Dentist is two behind t1's train: no editor, nothing undone.
  openEditorOn(/^Dentist/);
  expect(screen.queryByRole('group', { name: 'Done stop' })).not.toBeInTheDocument();
  expect(store.getState()).toBe(before);
  // Shared is the dot just behind on both lines: Not done puts back Shared and leaves Dentist.
  openEditorOn(/^Shared/);
  act(() => screen.getByRole('button', { name: 'Not done' }).click());
  expect(stopNamed(store, 'shared').done).toBe(false);
  expect(stopNamed(store, 'dentist').done).toBe(true);
});

test('a day stop done ahead of its project train opens Not done and comes back', () => {
  vi.useFakeTimers();
  // Shared first on the day and done there: t2 departed, t1 has not reached it yet.
  const world = dayOn(WAITING);
  const day = world.tracks.find((t) => t.day)!;
  day.stops = ['shared', 'dayEnd'];
  day.day!.budgets = [1000, 0];
  const store = createStore(world);
  render(<App store={store} now={() => WAITING} />);
  act(() => tapOn(screen.getByRole('button', { name: /^Shared/ })));
  expect(stopNamed(store, 'shared').done).toBe(true);
  openEditorOn(/^Shared/);
  act(() => screen.getByRole('button', { name: 'Not done' }).click());
  expect(stopNamed(store, 'shared').done).toBe(false);
});

test('tapping the day train follows the day train, not the project motion on its legs', () => {
  reduceMotion();
  const NOW = 500_000;
  const world = dayOn(NOW);
  render(<App store={createStore(world)} now={() => NOW} />);
  const dayTrain = () => trackSvg(2).querySelector('[data-train]') as SVGElement;
  act(() => {
    fireEvent.pointerDown(dayTrain(), point(500, 400));
    fireEvent.pointerUp(dayTrain(), point(500, 400));
  });
  // The shadow is half way down its first leg, at (1000, -200); the camera centres there.
  expect(dayState(world.tracks[2], world, NOW).at).toEqual({ x: 1000, y: -200 });
  const [x, y] = /translate\(([-\d.e]+)px,\s*([-\d.e]+)px/.exec(dayTrain().style.transform)!.slice(1).map(Number);
  expect(x).toBeCloseTo(window.innerWidth / 2, 3);
  expect(y).toBeCloseTo(window.innerHeight / 2, 3);
});

test("the day's-end square's editor is only a hold, and the hold clears the day", () => {
  vi.useFakeTimers();
  const store = createStore(dayOn(WAITING));
  render(<App store={store} now={() => WAITING} />);
  act(() => {
    fireEvent.pointerDown(dayEndButton()!, point(500, 400));
    vi.advanceTimersByTime(600);
  });
  fireEvent.pointerUp(dayEndButton()!, point(500, 400));
  expect(screen.queryByRole('textbox', { name: 'Stop title' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Step' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Sub-goal' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
  const hold = screen.getByRole('button', { name: 'Hold to delete the day' });
  fireEvent.pointerDown(hold, point(500, 700));
  act(() => {
    vi.advanceTimersByTime(700);
  });
  expect(dayIn(store)).toBeUndefined();
  expect(store.getState().tracks).toEqual(dayOn(WAITING).tracks.filter((t) => !t.day));
  expect(store.getState().stops).toEqual(twoLines().stops);
  expect(screen.queryByRole('button', { name: 'Hold to delete the day' })).not.toBeInTheDocument();
});

test("dragging a stop whose button speaks for the day shows its project leg's time", () => {
  // Shared is on t1 only, behind Dentist, and first on the day: its button speaks for the day.
  const world = twoLines();
  world.tracks[1].stops = ['goal2'];
  world.tracks.push({
    id: 'day',
    color: 2,
    origin: { x: 1500, y: 200 },
    stops: ['shared', 'dayEnd'],
    train: { leg: 0, departedAt: 0 },
    target: 'next',
    day: { date: dayOf(WAITING), budgets: [1000, 0] },
  });
  world.stops.push({ id: 'dayEnd', title: '', shape: 'square', size: 'small', x: 1500, y: 900, done: false });
  const store = createStore(world);
  render(<App store={store} now={() => WAITING} />);
  expect(document.querySelector('[data-id="shared"]')).toHaveAttribute('data-track', 'day');
  const el = screen.getByRole('button', { name: /^Shared/ });
  const x = parseFloat(el.style.left) + 4;
  const y = parseFloat(el.style.top);
  act(() => {
    fireEvent.pointerDown(el, point(x, y));
    fireEvent.pointerMove(el, point(x + 50, y + 30));
  });
  expect(stopNamed(store, 'shared')).not.toMatchObject({ x: 1500, y: 600 });
  const state = store.getState();
  const t1 = state.tracks[0];
  const seconds = legSeconds(trackRoute(t1, new Map(state.stops.map((s) => [s.id, s]))), 1);
  expect(document.querySelector('.leg-time')!.textContent).toBe(formatSeconds(seconds));
  act(() => fireEvent.pointerUp(el, point(x + 50, y + 30)));
});

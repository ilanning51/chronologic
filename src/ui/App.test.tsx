import uiCss from '../styles/ui.css?raw';
import tokensCss from '../styles/tokens.css?raw';
import { StrictMode } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { DEFAULT_GOAL_SECONDS } from '../model/reducer';
import { legSeconds, trackRoute, trainState } from '../model/train';
import { MAX_SCALE } from '../plane/camera';
import { formatSeconds, gridFor, UNITS } from '../plane/grid';
import { createStore } from '../store/store';
import { running } from '../test/fixtures';
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

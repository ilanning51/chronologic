import uiCss from '../styles/ui.css?raw';
import tokensCss from '../styles/tokens.css?raw';
import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { addDays, dayOf } from '../model/days';
import { dayState, legSeconds, timeLeft, trackRoute, trainState } from '../model/train';
import { MAX_SCALE } from '../plane/camera';
import { DAY_PAPER, gridTint, paperAt } from '../plane/daylight';
import { formatSeconds, gridFor, UNITS } from '../plane/grid';
import { createStore } from '../store/store';
import { LANE_PX, LIFE_WIDTH, TRACK_WIDTH } from '../plane/world';
import { running, twoLines, withDay, withLife, withWeek } from '../test/fixtures';
import type { World } from '../model/types';
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

test('a done goal stays as a terminus: a large ink dot that keeps its name in ink', () => {
  const world = running();
  world.stops = world.stops.map((s) => ({ ...s, done: true }));
  world.tracks[0].train = { leg: 2, departedAt: 0 };
  render(<App store={createStore(world)} now={() => 500_000} />);
  const goal = screen.getByRole('button', { name: /^Wristband.*done/ });
  expect(goal).toHaveClass('terminus');
  expect(goal.querySelector('.shape.dot')).toBeInTheDocument();
  // A passed step is an ordinary dot.
  expect(screen.getByRole('button', { name: /^Dentist/ })).not.toHaveClass('terminus');
  const dot = /\.stop\.terminus \.shape\.dot\s*\{([^}]*)\}/.exec(uiCss)?.[1] ?? '';
  expect(dot).toMatch(/width:\s*var\(--disc-large\)/);
  expect(dot).toMatch(/background:\s*var\(--ink\)/);
  expect(/\.stop\.terminus \.label\s*\{([^}]*)\}/.exec(uiCss)?.[1]).toMatch(/color:\s*var\(--ink\)/);
  // The terminus rules come after the finished and done ones, so they win at equal weight.
  expect(uiCss.indexOf('.stop.terminus .shape.dot')).toBeGreaterThan(uiCss.indexOf('.stop.finished .shape.dot'));
  expect(uiCss.indexOf('.stop.terminus .label')).toBeGreaterThan(uiCss.indexOf('.stop.done .label'));
});

test('a done square on the life line is a landmark: a small ink square that keeps its name in ink, under its own rules', () => {
  const world = withLife();
  world.stops.find((s) => s.id === 'start')!.done = true;
  render(<App store={createStore(world)} now={() => 500_000} />);
  const square = screen.getByRole('button', { name: /^Start.*done/ });
  expect(square).toHaveClass('landmark');
  expect(square).not.toHaveClass('terminus');
  const dot = /\.stop\.landmark \.shape\.dot\s*\{([^}]*)\}/.exec(uiCss)?.[1] ?? '';
  expect(dot).toMatch(/width:\s*var\(--disc-small\)/);
  expect(dot).toMatch(/border-radius:\s*0/);
  expect(dot).toMatch(/background:\s*var\(--ink\)/);
  expect(/\.stop\.landmark \.label\s*\{([^}]*)\}/.exec(uiCss)?.[1]).toMatch(/color:\s*var\(--ink\)/);
  // After the finished and done rules, so they win at equal weight.
  expect(uiCss.indexOf('.stop.landmark .shape.dot')).toBeGreaterThan(uiCss.indexOf('.stop.finished .shape.dot'));
  expect(uiCss.indexOf('.stop.landmark .label')).toBeGreaterThan(uiCss.indexOf('.stop.done .label'));
});

test("a goal's name is set in bold capitals on the plane and in its bubble", () => {
  render(<App store={createStore(running())} now={() => WAITING} />);
  expect(screen.getByText('Wristband')).toHaveClass('label', 'goal-name');
  expect(screen.getByText('Dentist')).not.toHaveClass('goal-name');
  const rule = /\.goal-name\s*\{([^}]*)\}/.exec(uiCss)?.[1] ?? '';
  expect(rule).toMatch(/font-weight:\s*700/);
  expect(rule).toMatch(/text-transform:\s*uppercase/);
});

test('the paper takes the tint of the hour: dusk is warm, and leaving gives the day paper back', () => {
  const dusk = new Date(2026, 10, 3, 19, 0).getTime();
  const { unmount } = render(<App store={createStore(running())} now={() => dusk} />);
  const root = document.documentElement;
  expect(root.style.getPropertyValue('--paper')).toBe(paperAt(19));
  expect(root.style.getPropertyValue('--grid')).toBe(gridTint(paperAt(19)));
  expect(paperAt(19)).not.toBe(DAY_PAPER);
  unmount();
  expect(root.style.getPropertyValue('--paper')).toBe('');
});

const PICTURE = 'data:image/jpeg;base64,AAAA';

test('a goal with a picture carries it as a mural, and its bubble shows it in place of the shape', () => {
  const world = running();
  world.stops[1].image = PICTURE;
  render(<App store={createStore(world)} now={() => WAITING} />);
  const goal = screen.getByRole('button', { name: /^Wristband/ });
  const mural = goal.querySelector('img.mural') as HTMLImageElement;
  expect(mural).toBeInTheDocument();
  expect(mural.getAttribute('src')).toBe(PICTURE);
  expect(screen.getByRole('button', { name: /^Dentist/ }).querySelector('img.mural')).toBeNull();
  // The mural paints only: the press goes to the stop. Its blocks scale up with hard edges.
  const rule = /\.stop \.mural\s*\{([^}]*)\}/.exec(uiCss)?.[1] ?? '';
  expect(rule).toMatch(/pointer-events:\s*none/);
  expect(rule).toMatch(/image-rendering:\s*pixelated/);
  expect(/\.bubble \.mural\s*\{([^}]*)\}/.exec(uiCss)?.[1]).toMatch(/image-rendering:\s*pixelated/);

  // The goal off screen: its bubble carries the picture, not the square.
  const far = farGoal();
  far.stops[1].image = PICTURE;
  cleanup();
  render(<App store={createStore(far)} now={() => 500_000} />);
  const bubble = document.querySelector('[data-target="bubble"]')!;
  expect((bubble.querySelector('img.mural') as HTMLImageElement).getAttribute('src')).toBe(PICTURE);
  expect(bubble.querySelector('.shape')).toBeNull();
  // No pill and no words: the picture centred in a square of the line's colour, which frames it.
  expect(bubble).toHaveClass('bubble', 'picture');
  expect(bubble.querySelector('.title')).toBeNull();
  expect(bubble).toHaveAccessibleName(/^Wristband, goal/);
  const frame = /\.bubble\.picture\s*\{([^}]*)\}/.exec(uiCss)?.[1] ?? '';
  expect(frame).toMatch(/background:\s*var\(--track-color\)/);
  expect(frame).toMatch(/border-radius:\s*0/);
  expect(frame).toMatch(/padding:\s*var\(--frame\)/);
  expect(tokensCss).toMatch(/--mural-small:\s*36px/);
  expect(tokensCss).toMatch(/--frame:\s*4px/);
});

test('a tap on a picture bubble flies out until the whole line is in view, and never cycles', () => {
  reduceMotion();
  const world = farGoal();
  world.stops[1].image = PICTURE;
  const store = createStore(world);
  render(<App store={store} now={() => 500_000} />);
  const bubble = document.querySelector('[data-target="bubble"]')!;
  expect(bubble).toHaveClass('picture');
  act(() => tapOn(bubble));
  // The target is unchanged: a picture bubble does not cycle.
  expect(store.getState().tracks[0].target).toBe('goal');
  // The goal is on screen now, with room around it, so no bubble is needed.
  expect(document.querySelector('[data-target="bubble"]')).not.toBeInTheDocument();
  const inView = (el: HTMLElement) => {
    const x = parseFloat(el.style.left);
    const y = parseFloat(el.style.top);
    return x >= 0 && x <= window.innerWidth && y >= 0 && y <= window.innerHeight;
  };
  expect(inView(screen.getByRole('button', { name: /^Dentist/ }))).toBe(true);
  expect(inView(screen.getByRole('button', { name: /^Wristband/ }))).toBe(true);
  const origin = document.querySelector('.origin-hit') as SVGRectElement;
  const ox = Number(/translate\(([-\d.e]+)px/.exec(origin.style.transform)![1]);
  expect(ox).toBeGreaterThanOrEqual(0);
});

test("a sketch's bubble is muted, like its line", () => {
  const world = running();
  world.tracks[0].stops = ['wristband'];
  world.stops = world.stops.filter((s) => s.id === 'wristband');
  // Far enough to be off screen even when the leg is fitted at the smallest zoom.
  world.stops[0].x = 1e11;
  render(<App store={createStore(world)} now={() => 500_000} />);
  const bubble = document.querySelector('[data-target="bubble"]') as HTMLElement;
  expect(bubble).toBeInTheDocument();
  expect(bubble.style.getPropertyValue('--track-color')).toBe('var(--muted)');
  expect(bubble.style.getPropertyValue('--track-on')).toBe('var(--on-plate)');
});

test("choosing a picture in the goal's editor keeps the shrunk one on the goal", async () => {
  vi.useFakeTimers();
  const store = createStore(running());
  const picture = vi.fn(async () => PICTURE);
  render(<App store={store} now={() => WAITING} picture={picture} />);
  openEditorOn(/^Wristband/);
  const file = new File(['x'], 'ship.jpg', { type: 'image/jpeg' });
  fireEvent.change(screen.getByLabelText('Choose a picture'), { target: { files: [file] } });
  expect(picture).toHaveBeenCalledWith(file);
  await act(async () => {
    await Promise.resolve();
  });
  expect(store.getState().stops.find((s) => s.id === 'wristband')!.image).toBe(PICTURE);
  expect(screen.getByRole('button', { name: /^Wristband/ }).querySelector('img.mural')).toBeInTheDocument();
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

/** Turns a tray brush on or off with a tap on its tile; the tray must be open. */
const tapTile = (name: string) => act(() => tapOn(screen.getByRole('button', { name })));

/** Strokes the paper from one screen point to another, in a few moves. */
function stroke(from: { x: number; y: number }, to: { x: number; y: number }) {
  const plane = screen.getByRole('main', { name: 'The plane' });
  fireEvent.pointerDown(plane, { pointerId: 1, clientX: from.x, clientY: from.y });
  for (const k of [0.25, 0.5, 1]) {
    fireEvent.pointerMove(plane, { pointerId: 1, clientX: from.x + (to.x - from.x) * k, clientY: from.y + (to.y - from.y) * k });
  }
  fireEvent.pointerUp(plane, { pointerId: 1, clientX: to.x, clientY: to.y });
}

/** Opens the tray if it is shut, turns the line brush on, and draws a line on empty paper. */
function drawLine(from = { x: 150, y: 650 }, to = { x: 450, y: 700 }) {
  if (!screen.queryByRole('button', { name: 'New line' })) openTray();
  if (screen.getByRole('button', { name: 'New line' }).getAttribute('aria-pressed') !== 'true') tapTile('New line');
  act(() => stroke(from, to));
}

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

test('the line brush draws a track from press to release and names it', () => {
  const store = createStore(running());
  render(<App store={store} now={() => WAITING} />);
  const scale = scaleOnScreen();
  const before = left(/^Dentist/);
  drawLine({ x: 150, y: 650 }, { x: 450, y: 700 });
  const { tracks, stops } = store.getState();
  expect(tracks).toHaveLength(2);
  const made = tracks[1];
  const goal = stops.find((s) => s.id === made.stops[0])!;
  expect(goal.x - made.origin.x).toBeCloseTo(300 / scale, 6);
  expect(goal.y - made.origin.y).toBeCloseTo(50 / scale, 6);
  expect(left(/^Dentist/)).toBe(before); // the camera stays where it was
  const field = screen.getByRole('textbox', { name: 'Line name' });
  act(() => {
    fireEvent.change(field, { target: { value: 'Thesis' } });
    fireEvent.keyDown(field, { key: 'Enter' });
  });
  expect(store.getState().stops.find((s) => s.id === goal.id)?.title).toBe('Thesis');
  // The tray stays open, and the brush stays on.
  expect(screen.getByRole('button', { name: 'New line' })).toHaveAttribute('aria-pressed', 'true');
});

test('Escape on a new goal name removes the track', () => {
  const store = createStore(running());
  render(<App store={store} now={() => WAITING} />);
  drawLine();
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
  // The goal's name in the bubble is set as it is on the plane.
  expect(bubble.querySelector('.title')).toHaveClass('goal-name');
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
  drawLine();
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
  drawLine();
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

/** A secondary-button press on a stop, dragged to a screen point and let go. */
function splitFrom(name: RegExp, to: { x: number; y: number }) {
  const el = screen.getByRole('button', { name });
  const from = { clientX: parseFloat(el.style.left), clientY: parseFloat(el.style.top) };
  fireEvent.pointerDown(el, { pointerId: 1, button: 2, ...from });
  fireEvent.pointerMove(el, { pointerId: 1, clientX: to.x, clientY: to.y });
  fireEvent.pointerUp(el, { pointerId: 1, button: 2, clientX: to.x, clientY: to.y });
}

test('dragging the goal with the secondary button splits a step off it, placed where it is let go on its line', () => {
  const store = createStore(running());
  render(<App store={store} now={() => WAITING} />);
  act(() => splitFrom(/^Wristband/, midLeg()));
  const state = store.getState();
  expect(state.tracks[0].stops).toHaveLength(3);
  const added = state.stops.find((s) => s.id === state.tracks[0].stops[1])!;
  // A large square gives a large triangle; the square itself is as it was.
  expect(added).toMatchObject({ shape: 'triangle', size: 'large', title: '', done: false });
  expect(added.x).toBeCloseTo(2000, 3);
  expect(stopNamed(store, 'wristband')).toMatchObject({ shape: 'square', size: 'large', x: 3000 });
  expect(screen.getByRole('textbox', { name: 'Stop title' })).toBeInTheDocument();
  expect(screen.queryByRole('group', { name: 'Edit stop' })).not.toBeInTheDocument();
});

test('a step split off a circle is a circle of its size, and one let go on paper is nothing', () => {
  const store = createStore(running());
  render(<App store={store} now={() => WAITING} />);
  act(() => splitFrom(/^Dentist/, midLeg()));
  const state = store.getState();
  expect(state.tracks[0].stops).toHaveLength(3);
  expect(state.stops.find((s) => s.id === state.tracks[0].stops[1])).toMatchObject({ shape: 'circle', size: 'medium' });
  act(() => splitFrom(/^Wristband/, { x: 500, y: 100 }));
  expect(store.getState().tracks[0].stops).toHaveLength(3);
  expect(document.querySelector('.ghost')).not.toBeInTheDocument();
});

test('a done dot splits nothing', () => {
  const world = running();
  world.stops[0].done = true;
  world.tracks[0].train = { leg: 1, departedAt: 0 };
  const store = createStore(world);
  render(<App store={store} now={() => 500_000} />);
  const before = store.getState();
  act(() => splitFrom(/^Dentist/, midLeg()));
  expect(store.getState()).toBe(before);
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

describe('a drag slides the drawn map', () => {
  const layer = () => document.querySelector('.world') as HTMLElement;
  const grid = () => document.querySelector('.grid') as HTMLElement;
  const press = (x: number, y: number) => fireEvent.pointerDown(paper(), { pointerId: 1, clientX: x, clientY: y });
  const moveTo = (x: number, y: number) => fireEvent.pointerMove(paper(), { pointerId: 1, clientX: x, clientY: y });
  const lift = (x: number, y: number) => fireEvent.pointerUp(paper(), { pointerId: 1, clientX: x, clientY: y });

  test('a short drag shifts the world layer and lays nothing out; letting go lays the map out where the hand left it', () => {
    render(<App store={createStore(running())} now={() => WAITING} />);
    const before = left(/^Dentist/);
    act(() => {
      press(100, 100);
      moveTo(160, 120);
    });
    expect(left(/^Dentist/)).toBe(before);
    expect(layer().style.transform).toMatch(/^translate3d\(60px, 20px, 0(px)?\)$/);
    act(() => lift(160, 120));
    expect(left(/^Dentist/)).toBeCloseTo(before + 60, 3);
    expect(layer().style.transform).toBe('');
  });

  test('the grid stays under the screen while its lines move with the map', () => {
    render(<App store={createStore(running())} now={() => WAITING} />);
    const at = grid().style.backgroundPosition;
    act(() => {
      press(100, 100);
      moveTo(160, 120);
    });
    expect(grid().style.transform).toMatch(/^translate3d\(-60px, -20px, 0(px)?\)$/);
    expect(grid().style.backgroundPosition).not.toBe(at);
    act(() => lift(160, 120));
    expect(grid().style.transform).toBe('');
  });

  test('a long drag lays the map out again before the slide passes what was drawn past the edge', () => {
    render(<App store={createStore(running())} now={() => WAITING} />);
    const before = left(/^Dentist/);
    act(() => {
      press(100, 100);
      moveTo(200, 100);
    });
    expect(left(/^Dentist/)).toBe(before);
    act(() => moveTo(320, 100));
    expect(left(/^Dentist/)).toBeCloseTo(before + 220, 3);
    expect(layer().style.transform).toBe('');
    act(() => lift(320, 100));
  });

  test('the trains hold still while the map slides and jump to now when it is let go', () => {
    vi.useFakeTimers();
    let t = 980_000;
    render(<App store={createStore(running())} now={() => t} />);
    const before = trainX();
    act(() => {
      press(100, 100);
      moveTo(120, 100);
    });
    t += 60_000;
    act(() => vi.advanceTimersByTime(60_000));
    expect(trainX()).toBe(before);
    act(() => lift(120, 100));
    // Laid out again without the clock catching up, the train would sit exactly 20 px on.
    expect(trainX() - (before + 20)).toBeGreaterThan(0.1);
  });
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
  // It hangs above the stop, which has moved with the finger.
  const moved = screen.getByRole('button', { name: /^Dentist/ });
  expect(parseFloat(label.style.left)).toBeCloseTo(parseFloat(moved.style.left), 3);
  expect(parseFloat(label.style.top)).toBeLessThan(parseFloat(moved.style.top));
  act(() => fireEvent.pointerUp(el, { pointerId: 1, clientX: x + 50, clientY: y + 30 }));
  expect(document.querySelector('.leg-time')).not.toBeInTheDocument();
});

test('while a stop is dragged, beneath it shows how long from now until its train gets there', () => {
  const store = createStore(running());
  const now = 300_000;
  render(<App store={store} now={() => now} />);
  expect(document.querySelector('.leg-time.until')).not.toBeInTheDocument();
  const el = screen.getByRole('button', { name: /^Dentist/ });
  const x = parseFloat(el.style.left) + 4;
  const y = parseFloat(el.style.top);
  act(() => {
    fireEvent.pointerDown(el, { pointerId: 1, clientX: x, clientY: y });
    fireEvent.pointerMove(el, { pointerId: 1, clientX: x + 50, clientY: y });
  });
  const state = store.getState();
  const until = timeLeft(state.tracks[0], 'dentist', new Map(state.stops.map((s) => [s.id, s])), now);
  const below = document.querySelector<HTMLElement>('.leg-time.until')!;
  expect(below.textContent).toBe(formatSeconds(until));
  // The leg from the line's start is the chip above, and the two are different times.
  const above = document.querySelectorAll<HTMLElement>('.leg-time')[0];
  expect(above.textContent).toBe(formatSeconds(legInto(store, 'dentist')));
  expect(above.textContent).not.toBe(below.textContent);
  const moved = screen.getByRole('button', { name: /^Dentist/ });
  expect(parseFloat(below.style.top)).toBeGreaterThan(parseFloat(moved.style.top));
  expect(parseFloat(below.style.left)).toBeCloseTo(parseFloat(moved.style.left), 3);
  act(() => fireEvent.pointerUp(el, { pointerId: 1, clientX: x + 50, clientY: y }));
  expect(document.querySelector('.leg-time')).not.toBeInTheDocument();
});

test('Tab hides the times of a drag and shows them again, even mid-drag', () => {
  const store = createStore(running());
  render(<App store={store} now={() => WAITING} />);
  const el = screen.getByRole('button', { name: /^Dentist/ });
  const x = parseFloat(el.style.left) + 4;
  const y = parseFloat(el.style.top);
  act(() => {
    fireEvent.pointerDown(el, { pointerId: 1, clientX: x, clientY: y });
    fireEvent.pointerMove(el, { pointerId: 1, clientX: x + 50, clientY: y });
  });
  expect(document.querySelectorAll('.leg-time')).toHaveLength(2);
  act(() => {
    fireEvent.keyDown(window, { key: 'Tab' });
  });
  expect(document.querySelector('.leg-time')).toBeNull();
  // Hidden, the drag still moves the stop.
  act(() => fireEvent.pointerMove(el, { pointerId: 1, clientX: x + 80, clientY: y }));
  expect(document.querySelector('.leg-time')).toBeNull();
  expect(store.getState().stops.find((s) => s.id === 'dentist')!.x).toBeGreaterThan(1000);
  act(() => fireEvent.pointerUp(el, { pointerId: 1, clientX: x + 80, clientY: y }));
  // Off stays off for the next drag, until Tab again.
  const again = screen.getByRole('button', { name: /^Dentist/ });
  const ax = parseFloat(again.style.left) + 4;
  act(() => {
    fireEvent.pointerDown(again, { pointerId: 2, clientX: ax, clientY: y });
    fireEvent.pointerMove(again, { pointerId: 2, clientX: ax + 30, clientY: y });
  });
  expect(document.querySelector('.leg-time')).toBeNull();
  act(() => {
    fireEvent.keyDown(window, { key: 'Tab' });
  });
  expect(document.querySelectorAll('.leg-time')).toHaveLength(2);
  act(() => fireEvent.pointerUp(again, { pointerId: 2, clientX: ax + 30, clientY: y }));
});

test('Tab in a text field and Shift+Tab are left to focus, and keep the times', () => {
  const store = createStore(running());
  render(<App store={store} now={() => WAITING} />);
  const shift = fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
  expect(shift).toBe(true);
  const field = document.createElement('input');
  document.body.appendChild(field);
  expect(fireEvent.keyDown(field, { key: 'Tab' })).toBe(true);
  field.remove();
  const el = screen.getByRole('button', { name: /^Dentist/ });
  const x = parseFloat(el.style.left) + 4;
  const y = parseFloat(el.style.top);
  act(() => {
    fireEvent.pointerDown(el, { pointerId: 1, clientX: x, clientY: y });
    fireEvent.pointerMove(el, { pointerId: 1, clientX: x + 50, clientY: y });
  });
  expect(document.querySelectorAll('.leg-time')).toHaveLength(2);
  act(() => fireEvent.pointerUp(el, { pointerId: 1, clientX: x + 50, clientY: y }));
});

test('a tile carried onto a line shows only the leg it would end, as it is no stop yet', () => {
  const store = createStore(running());
  render(<App store={store} now={() => WAITING} />);
  openTray();
  const tile = screen.getByRole('button', { name: 'Step' });
  const target = midLeg();
  act(() => {
    fireEvent.pointerDown(tile, { pointerId: 1, clientX: 900, clientY: 740 });
    fireEvent.pointerMove(tile, { pointerId: 1, clientX: target.x, clientY: target.y });
  });
  expect(document.querySelectorAll('.leg-time')).toHaveLength(1);
  act(() => fireEvent.pointerUp(tile, { pointerId: 1, clientX: target.x, clientY: target.y }));
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
/** The strokes of the road ahead of the train, which carry the line's colour. */
const strokes = (svg: SVGSVGElement) =>
  [...svg.querySelectorAll<SVGLineElement>('line:not(.behind)')].map((l) => [l.style.stroke, parseFloat(l.style.strokeWidth)]);
/** The strokes of the road behind the train. */
const behindStrokes = (svg: SVGSVGElement) => [...svg.querySelectorAll<SVGLineElement>('line.behind')].map((l) => l.style.stroke);

test('the road behind the train is muted and the road ahead keeps the colour', () => {
  render(<App store={createStore(running())} now={() => 500_000} />);
  const svg = trackSvg(0);
  expect(behindStrokes(svg).length).toBeGreaterThan(0);
  for (const s of behindStrokes(svg)) expect(s).toBe('var(--muted)');
  expect(strokes(svg).length).toBeGreaterThan(0);
  for (const s of strokes(svg)) expect(s[0]).toBe('var(--track-blue)');
});
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
  // The map's transfer: a paper capsule in a fine ink outline, its disc inside.
  const capsule = cssRule('.stop .shape.ring');
  expect(capsule).toMatch(/background:\s*var\(--paper\)/);
  expect(capsule).toMatch(/inset 0 0 0 var\(--capsule-outline\) var\(--ink\)/);
  const disc = cssRule('.stop .shape.ring::before');
  expect(disc).toMatch(/inset:\s*calc\(var\(--capsule-pad\) \+ var\(--capsule-outline\)\)/);
  expect(disc).toMatch(/background:\s*var\(--ink\)/);
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
  // Every target off screen, so each line shows a bubble; the day line points at its end. The
  // day starts far above, so the opening fits a long leg and both projects are in view.
  for (const id of ['wristband', 'goal2', 'dayEnd']) world.stops.find((s) => s.id === id)!.x = 1e6;
  world.tracks[2].target = 'goal';
  world.tracks[2].origin = { x: 1000, y: -4000 };
  render(<App store={createStore(world)} now={() => 500_000} />);
  const bubble = (track: string) => document.querySelector(`[data-target="bubble"][data-track="${track}"]`) as HTMLElement;
  const shown = [...document.querySelectorAll<HTMLElement>('[data-target="bubble"]')].map((b) => b.dataset.track);
  expect(shown.sort()).toEqual(['day', 't1', 't2']);
  // t1 is 500 s from Dentist, t2 1000 s from Shared: one bubble is filled, and it is t1's.
  expect(document.querySelectorAll('.bubble.soonest')).toHaveLength(1);
  expect(bubble('t1')).toHaveClass('bubble', 'soonest');
  expect(bubble('t2')).not.toHaveClass('soonest');
  expect(bubble('day')).not.toHaveClass('soonest');
  expect(bubble('day').style.getPropertyValue('--track-color')).toBe('var(--ink)');
  // Words on a line's colour take that colour's own text colour: white on blue, ink on yellow.
  expect(bubble('t1').style.getPropertyValue('--track-on')).toBe('var(--track-blue-on)');
  expect(bubble('t2').style.getPropertyValue('--track-on')).toBe('var(--track-yellow-on)');
  expect(bubble('day').style.getPropertyValue('--track-on')).toBe('var(--on-plate)');
  // The day's mark shows white on the black plate, so its bubble says it is the day's.
  expect(bubble('day')).toHaveClass('day');
  expect(bubble('t1')).not.toHaveClass('day');
  const filled = cssRule('.bubble.soonest');
  // Filled with the shade of the line that words read on.
  expect(bubble('t1').style.getPropertyValue('--track-fill')).toBe('var(--track-blue-fill)');
  expect(filled).toMatch(/background:\s*var\(--track-fill\)/);
  expect(filled).toMatch(/color:\s*var\(--track-on\)/);
  expect(cssRule('.bubble.soonest .shape')).toMatch(/background:\s*var\(--track-on\)/);
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
    day: { date: dayOf(WAITING), budgets: [1000, 0, 0], lengths: [3600, 3600, 1800] },
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
    day: { date: dayOf(WAITING), budgets: [1000, 0, 0], lengths: [3600, 3600, 1800] },
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
  // It runs in its own lane beside the project line it shares the road with, a lane's width at most from the road.
  const [x, y] = /translate\(([-\d.e]+)px,\s*([-\d.e]+)px/.exec(dayTrain().style.transform)!.slice(1).map(Number);
  expect(Math.hypot(x - window.innerWidth / 2, y - window.innerHeight / 2)).toBeLessThanOrEqual(LANE_PX);
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
    day: { date: dayOf(WAITING), budgets: [1000, 0], lengths: [3600, 1800] },
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

// Levels: from far away the map draws only its big shapes, as a map draws cities and not streets.

/** Zooms the wheel until one grid square is six hours, where a medium circle is below the level. */
function zoomOutToSixHours() {
  act(() => {
    fireEvent.wheel(paper(), { clientX: 500, clientY: 400, deltaY: 2500 });
  });
  expect(document.querySelector('.legend')!.textContent).toBe('6 hours');
}

test('zoomed out, a stop below the level is not drawn, while the next stop and the goal are', () => {
  const world = running();
  world.tracks[0].stops = ['dentist', 'later', 'wristband'];
  world.stops.push({ id: 'later', title: 'Later', shape: 'circle', size: 'medium', x: 2000, y: 0, done: false });
  render(<App store={createStore(world)} now={() => WAITING} />);
  expect(screen.getByRole('button', { name: /^Later/ })).toBeInTheDocument();
  zoomOutToSixHours();
  expect(screen.queryByRole('button', { name: /^Later/ })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /^Dentist/ })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /^Wristband/ })).toBeInTheDocument();
});

test('a stop added while zoomed out stays drawn until the next zoom', () => {
  // The far goal opens at a day a square, where a medium circle is below the level.
  const store = createStore(farGoal());
  render(<App store={store} now={() => WAITING} />);
  expect(document.querySelector('.legend')!.textContent).toBe('1 day');
  openTray();
  act(() => dragTile('Step', midLeg()));
  expect(store.getState().tracks[0].stops).toHaveLength(3);
  const field = screen.getByRole('textbox', { name: 'Stop title' });
  act(() => {
    fireEvent.change(field, { target: { value: 'Order parts' } });
    fireEvent.keyDown(field, { key: 'Enter' });
  });
  expect(screen.getByRole('button', { name: /^Order parts/ })).toBeInTheDocument();
  act(() => {
    fireEvent.wheel(paper(), { clientX: 500, clientY: 400, deltaY: 10 });
  });
  expect(screen.queryByRole('button', { name: /^Order parts/ })).not.toBeInTheDocument();
});

test('a stop being named stays drawn through a zoom, so its field has somewhere to be', () => {
  const store = createStore(farGoal());
  render(<App store={store} now={() => WAITING} />);
  openTray();
  act(() => dragTile('Step', midLeg()));
  act(() => {
    fireEvent.wheel(paper(), { clientX: 500, clientY: 400, deltaY: 10 });
  });
  expect(screen.getByRole('button', { name: /^Unnamed, step/ })).toBeInTheDocument();
  const box = screen.getByRole('textbox', { name: 'Stop title' }).closest<HTMLElement>('.name-field')!;
  expect(parseFloat(box.style.left)).toBeGreaterThan(0);
});

test('the start of a line has a 44 px hit target that paints nothing', () => {
  render(<App store={createStore(running())} now={() => WAITING} />);
  const hit = document.querySelector<SVGRectElement>('[data-target="origin"]')!;
  expect(hit).toBeInTheDocument();
  expect(hit.getAttribute('width')).toBe('44');
  expect(hit.getAttribute('height')).toBe('44');
  expect(hit.getAttribute('fill')).toBe('none');
  expect(hit.dataset.track).toBe('t1');
});

/** Presses on a line's start 4 px off its centre, moves by (dx, dy), and returns the release. */
function dragOrigin(dx: number, dy: number) {
  const hit = document.querySelector<SVGRectElement>('[data-target="origin"]')!;
  const m = /translate\(([-\d.e]+)px, ([-\d.e]+)px\)/.exec(hit.style.transform)!;
  const x = parseFloat(m[1]) + 4;
  const y = parseFloat(m[2]);
  fireEvent.pointerDown(hit, { pointerId: 1, clientX: x, clientY: y });
  fireEvent.pointerMove(hit, { pointerId: 1, clientX: x + dx, clientY: y + dy });
  return () => fireEvent.pointerUp(hit, { pointerId: 1, clientX: x + dx, clientY: y + dy });
}

test('dragging the start of a line moves it, keeps the train, and shows the first leg time', () => {
  const NOW = 500_000;
  const store = createStore(running());
  render(<App store={store} now={() => NOW} />);
  const stops = () => new Map(store.getState().stops.map((s) => [s.id, s]));
  const was = trainState(store.getState().tracks[0], stops(), NOW);
  // The goal is off screen at this clock, so read the scale from the start to Dentist, 1000 s apart.
  const hit = document.querySelector<SVGRectElement>('[data-target="origin"]')!;
  const originX = parseFloat(/translate\(([-\d.e]+)px/.exec(hit.style.transform)![1]);
  const scale = (left(/^Dentist/) - originX) / 1000;
  let up = () => {};
  act(() => {
    up = dragOrigin(-50, 30);
  });
  const track = store.getState().tracks[0];
  expect(track.origin.x).toBeCloseTo(-50 / scale, 6);
  expect(track.origin.y).toBeCloseTo(30 / scale, 6);
  expect(stopNamed(store, 'dentist')).toMatchObject({ x: 1000, y: 0 });
  expect(trainState(track, stops(), NOW).seconds).toBeCloseTo(was.seconds, 6);
  const chip = document.querySelector('.leg-time')!;
  expect(chip.textContent).toBe(formatSeconds(legSeconds(trackRoute(track, stops()), 0)));
  act(() => up());
  expect(document.querySelector('.leg-time')).not.toBeInTheDocument();
});

test('past the first stop the start drags with no chip', () => {
  const world = running();
  world.stops[0].done = true;
  world.tracks[0].train = { leg: 1, departedAt: 0 };
  const store = createStore(world);
  render(<App store={store} now={() => 500_000} />);
  let up = () => {};
  act(() => {
    up = dragOrigin(-50, 0);
  });
  expect(store.getState().tracks[0].origin.x).toBeLessThan(0);
  expect(document.querySelector('.leg-time')).not.toBeInTheDocument();
  act(() => up());
});

const box = () => document.querySelector<HTMLElement>('.selection-box');

/** Shift-drags on the plane from (x0, y0) to (x1, y1). */
function drawBox(x0: number, y0: number, x1: number, y1: number) {
  fireEvent.pointerDown(paper(), { pointerId: 1, clientX: x0, clientY: y0, shiftKey: true });
  fireEvent.pointerMove(paper(), { pointerId: 1, clientX: x1, clientY: y1 });
  fireEvent.pointerUp(paper(), { pointerId: 1, clientX: x1, clientY: y1 });
}

/** Drags from a screen point by (dx, dy) on whatever element is given. */
function dragOn(el: Element, x: number, y: number, dx: number, dy: number) {
  fireEvent.pointerDown(el, { pointerId: 1, clientX: x, clientY: y });
  fireEvent.pointerMove(el, { pointerId: 1, clientX: x + dx, clientY: y + dy });
  fireEvent.pointerUp(el, { pointerId: 1, clientX: x + dx, clientY: y + dy });
}

test('a shift drag on paper draws a box, and a plain drag still pans', () => {
  const store = createStore(running());
  render(<App store={store} now={() => WAITING} />);
  const before = left(/^Dentist/);
  act(() => {
    fireEvent.pointerDown(paper(), { pointerId: 1, clientX: 100, clientY: 100, shiftKey: true });
    fireEvent.pointerMove(paper(), { pointerId: 1, clientX: 300, clientY: 250 });
  });
  expect(box()).toHaveClass('live');
  expect(box()!.style.left).toBe('100px');
  expect(box()!.style.width).toBe('200px');
  expect(left(/^Dentist/)).toBe(before);
  act(() => fireEvent.pointerUp(paper(), { pointerId: 1, clientX: 300, clientY: 250 }));
  expect(box()).toBeNull(); // nothing inside: no selection
  act(() => dragOn(paper(), 100, 100, 50, 0));
  expect(left(/^Dentist/)).toBeCloseTo(before + 50, 3);
});

test('letting go keeps a box snug around what it caught, and dragging inside moves it all', () => {
  const store = createStore(running());
  render(<App store={store} now={() => WAITING} />);
  const scale = scaleOnScreen();
  const dx = left(/^Dentist/);
  const gx = left(/^Wristband/);
  const y = parseFloat(screen.getByRole('button', { name: /^Dentist/ }).style.top);
  act(() => drawBox(dx - 30, y - 30, gx + 30, y + 30));
  expect(box()).not.toHaveClass('live');
  expect(parseFloat(box()!.style.left)).toBeCloseTo(dx - 24, 3);
  expect(parseFloat(box()!.style.width)).toBeCloseTo(gx - dx + 48, 3);
  const before = store.getState();
  act(() => dragOn(box()!, (dx + gx) / 2, y, 60, 40));
  const after = store.getState();
  expect(stopNamed(store, 'dentist').x).toBeCloseTo(1000 + 60 / scale, 6);
  expect(stopNamed(store, 'wristband').x).toBeCloseTo(3000 + 60 / scale, 6); // translated, not scaled
  expect(stopNamed(store, 'wristband').y).toBeCloseTo(40 / scale, 6);
  expect(after.tracks[0].origin).toEqual(before.tracks[0].origin); // not in the box
  expect(document.querySelector('.leg-time')).toBeNull();
  expect(parseFloat(box()!.style.left)).toBeCloseTo(dx + 60 - 24, 3);
});

test('dragging a selected stop moves the group, a stop outside drags alone', () => {
  const store = createStore(running());
  render(<App store={store} now={() => WAITING} />);
  const scale = scaleOnScreen();
  const dx = left(/^Dentist/);
  const y = parseFloat(screen.getByRole('button', { name: /^Dentist/ }).style.top);
  // Catch the origin and Dentist, not the goal.
  act(() => drawBox(dx - 1000 * scale - 30, y - 30, dx + 30, y + 30));
  expect(store.getState().tracks[0].origin).toEqual({ x: 0, y: 0 });
  act(() => dragStop(/^Dentist/, 0, 50));
  expect(store.getState().tracks[0].origin.y).toBeCloseTo(50 / scale, 6);
  expect(stopNamed(store, 'dentist').y).toBeCloseTo(50 / scale, 6);
  expect(stopNamed(store, 'wristband').y).toBe(0);
  act(() => dragStop(/^Wristband/, 0, 50));
  expect(stopNamed(store, 'dentist').y).toBeCloseTo(50 / scale, 6); // unchanged
  expect(box()).not.toBeNull(); // the selection survives a drag outside it
});

test('a tap on paper, a tap on the box or Escape clears the selection, and a pan keeps it', () => {
  const store = createStore(running());
  render(<App store={store} now={() => WAITING} />);
  const dx = left(/^Dentist/);
  // Read afresh each time: the pan below moves Dentist on screen.
  const select = () => {
    const x = left(/^Dentist/);
    const y = parseFloat(screen.getByRole('button', { name: /^Dentist/ }).style.top);
    act(() => drawBox(x - 30, y - 30, x + 30, y + 30));
  };
  select();
  act(() => dragOn(paper(), 100, 700, 50, 0));
  expect(box()).not.toBeNull();
  expect(parseFloat(box()!.style.left)).toBeCloseTo(dx + 50 - 24, 3);
  act(() => tapOn(paper()));
  expect(box()).toBeNull();
  select();
  act(() => tapOn(box()!));
  expect(box()).toBeNull();
  select();
  act(() => {
    fireEvent.keyDown(window, { key: 'Escape' });
  });
  expect(box()).toBeNull();
});

test('a box picks in world coordinates after a zoom, and a hidden stop moves with its group', () => {
  reduceMotion();
  // A small circle after the next stop: hidden once the grid is coarser than fifteen minutes.
  const world = running();
  world.stops.push({ id: 'tiny', title: 'Tiny', shape: 'circle', size: 'small', x: 2000, y: 0, done: false });
  world.tracks[0].stops = ['dentist', 'tiny', 'wristband'];
  const store = createStore(world);
  render(<App store={store} now={() => WAITING} />);
  // Zoom out with the wheel until Tiny is below the level.
  let turns = 0;
  while (screen.queryByRole('button', { name: /^Tiny/ }) && turns++ < 20) {
    act(() => {
      fireEvent.wheel(paper(), { clientX: 500, clientY: 400, deltaY: 500 });
    });
  }
  expect(screen.queryByRole('button', { name: /^Tiny/ })).toBeNull();
  const gx = left(/^Wristband/);
  const y = parseFloat(screen.getByRole('button', { name: /^Wristband/ }).style.top);
  act(() => drawBox(0, y - 30, gx + 30, y + 30));
  act(() => dragOn(box()!, gx - 10, y, 0, 50));
  expect(stopNamed(store, 'tiny').y).toBeGreaterThan(0);
  expect(stopNamed(store, 'tiny').y).toBeCloseTo(stopNamed(store, 'wristband').y, 6);
});

test('deleting the one selected stop clears the box', () => {
  const store = createStore(running());
  render(<App store={store} now={() => WAITING} />);
  const dx = left(/^Dentist/);
  const y = parseFloat(screen.getByRole('button', { name: /^Dentist/ }).style.top);
  act(() => drawBox(dx - 30, y - 30, dx + 30, y + 30));
  expect(parseFloat(box()!.style.width)).toBeCloseTo(48, 3);
  act(() => store.dispatch({ type: 'delete', id: 'dentist', now: WAITING }));
  expect(box()).toBeNull();
});

test("the start's hit target is drawn above the line, so a press on the rounded end is the start's", () => {
  render(<App store={createStore(running())} now={() => WAITING} />);
  const hit = document.querySelector('[data-target="origin"]')!;
  const lines = [...hit.parentElement!.querySelectorAll('line')];
  expect(lines.length).toBeGreaterThan(0);
  // Later in the svg is on top. Every line must come before the hit rect.
  for (const line of lines) expect(line.compareDocumentPosition(hit) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  // The rolling train's own target stays above the start's, so a train just departed is still a train.
  const train = document.querySelector('.train-hit');
  if (train) expect(hit.compareDocumentPosition(train) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

test('the start of a fresh line drags from under its own train', () => {
  const NOW = 500_000;
  const world = running();
  world.tracks[0].train = { leg: 0, departedAt: NOW }; // just departed: the train sits on the start
  const store = createStore(world);
  render(<App store={store} now={() => NOW} />);
  const origin = document.querySelector<SVGRectElement>('[data-target="origin"]')!;
  const m = /translate\(([-\d.e]+)px, ([-\d.e]+)px\)/.exec(origin.style.transform)!;
  const x = parseFloat(m[1]);
  const y = parseFloat(m[2]);
  // The press lands on the train's own hit square, which is drawn above the start's.
  const trainHit = document.querySelector('.train-hit')!;
  act(() => {
    fireEvent.pointerDown(trainHit, { pointerId: 1, clientX: x + 3, clientY: y });
    fireEvent.pointerMove(trainHit, { pointerId: 1, clientX: x + 3, clientY: y + 60 });
    fireEvent.pointerUp(trainHit, { pointerId: 1, clientX: x + 3, clientY: y + 60 });
  });
  expect(store.getState().tracks[0].origin.y).toBeGreaterThan(0);
  expect(stopNamed(store, 'dentist')).toMatchObject({ x: 1000, y: 0 });
});

test('a line stroke takes no pointer events, so a press on it falls through to the box or the paper', () => {
  const rule = /\.track line\s*\{([^}]*)\}/.exec(uiCss)?.[1] ?? '';
  expect(rule).toMatch(/pointer-events:\s*none/);
});

test('a shift drag inside the kept box draws a new box instead of moving the group', () => {
  const store = createStore(running());
  render(<App store={store} now={() => WAITING} />);
  const dx = left(/^Dentist/);
  const y = parseFloat(screen.getByRole('button', { name: /^Dentist/ }).style.top);
  act(() => drawBox(dx - 30, y - 30, dx + 30, y + 30));
  const before = store.getState();
  act(() => {
    fireEvent.pointerDown(box()!, { pointerId: 1, clientX: dx, clientY: y, shiftKey: true });
    fireEvent.pointerMove(box()!, { pointerId: 1, clientX: dx + 80, clientY: y + 80 });
  });
  expect(box()).toHaveClass('live');
  expect(store.getState()).toBe(before);
  act(() => fireEvent.pointerUp(box()!, { pointerId: 1, clientX: dx + 80, clientY: y + 80 }));
  expect(box()).not.toBeNull(); // the new box caught Dentist again
  expect(box()).not.toHaveClass('live');
});

test('Escape in an open name field cancels the name and keeps the selection', () => {
  const store = createStore(running());
  render(<App store={store} now={() => WAITING} />);
  const dx = left(/^Dentist/);
  const y = parseFloat(screen.getByRole('button', { name: /^Dentist/ }).style.top);
  act(() => drawBox(dx - 30, y - 30, dx + 30, y + 30));
  expect(box()).not.toBeNull();
  drawLine();
  act(() => {
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Line name' }), { key: 'Escape' });
  });
  expect(store.getState().tracks).toHaveLength(1); // the name was cancelled, as before
  expect(box()).not.toBeNull(); // and the box is still there
});

test("dragging the start of a line past its first stop leaves the train's clock alone", () => {
  let t = 500_000;
  const world = running();
  world.stops[0].done = true;
  world.tracks[0].train = { leg: 1, departedAt: 0 };
  const store = createStore(world);
  render(<App store={store} now={() => t} />);
  const hit = document.querySelector<SVGRectElement>('[data-target="origin"]')!;
  const m = /translate\(([-\d.e]+)px, ([-\d.e]+)px\)/.exec(hit.style.transform)!;
  const x = parseFloat(m[1]);
  const y = parseFloat(m[2]);
  act(() => {
    fireEvent.pointerDown(hit, { pointerId: 1, clientX: x, clientY: y });
    fireEvent.pointerMove(hit, { pointerId: 1, clientX: x - 20, clientY: y });
  });
  t += 10_000; // ten seconds pass mid-drag
  act(() => {
    fireEvent.pointerMove(hit, { pointerId: 1, clientX: x - 40, clientY: y });
    fireEvent.pointerUp(hit, { pointerId: 1, clientX: x - 40, clientY: y });
  });
  // The train's leg never changed, so its departure is as it was: it was not held still.
  expect(Math.abs(store.getState().tracks[0].train.departedAt)).toBeLessThan(100);
});

test("a group move that leaves the train's leg alone leaves its clock alone", () => {
  let t = 500_000;
  const world = running();
  world.stops[1].x = 1300; // close enough that the goal is on screen mid-leg
  const store = createStore(world);
  render(<App store={store} now={() => t} />);
  const gx = left(/^Wristband/);
  const y = parseFloat(screen.getByRole('button', { name: /^Wristband/ }).style.top);
  act(() => drawBox(gx - 30, y - 30, gx + 30, y + 30));
  expect(box()).not.toBeNull();
  act(() => {
    fireEvent.pointerDown(box()!, { pointerId: 1, clientX: gx, clientY: y });
    fireEvent.pointerMove(box()!, { pointerId: 1, clientX: gx, clientY: y + 30 });
  });
  t += 10_000;
  act(() => {
    fireEvent.pointerMove(box()!, { pointerId: 1, clientX: gx, clientY: y + 60 });
    fireEvent.pointerUp(box()!, { pointerId: 1, clientX: gx, clientY: y + 60 });
  });
  expect(stopNamed(store, 'wristband').y).toBeGreaterThan(0);
  expect(Math.abs(store.getState().tracks[0].train.departedAt)).toBeLessThan(100);
});

test("dragging the day line's start moves it with no chip, and no train moves", () => {
  const NOW = 500_000;
  const store = createStore(dayOn(NOW));
  render(<App store={store} now={() => NOW} />);
  const before = store.getState();
  const hit = document.querySelector<SVGRectElement>('[data-target="origin"][data-track="day"]')!;
  const m = /translate\(([-\d.e]+)px, ([-\d.e]+)px\)/.exec(hit.style.transform)!;
  const x = parseFloat(m[1]);
  const y = parseFloat(m[2]);
  act(() => {
    fireEvent.pointerDown(hit, { pointerId: 1, clientX: x, clientY: y });
    fireEvent.pointerMove(hit, { pointerId: 1, clientX: x - 30, clientY: y - 30 });
  });
  expect(document.querySelector('.leg-time')).not.toBeInTheDocument();
  act(() => fireEvent.pointerUp(hit, { pointerId: 1, clientX: x - 30, clientY: y - 30 }));
  const after = store.getState();
  const day = after.tracks.find((t) => t.day)!;
  expect(day.origin.x).toBeLessThan(1000);
  expect(day.origin.y).toBeLessThan(-400);
  expect(day.train).toEqual(before.tracks.find((t) => t.day)!.train);
  for (const t of after.tracks.filter((t) => !t.day)) expect(t.train).toEqual(before.tracks.find((b) => b.id === t.id)!.train);
  expect(after.stops).toEqual(before.stops);
});

/** Draws a box snug around the named stop, as Shift-drag on paper would. */
function boxAround(name: RegExp) {
  const x = left(name);
  const y = parseFloat(screen.getByRole('button', { name }).style.top);
  act(() => drawBox(x - 30, y - 30, x + 30, y + 30));
}

test('Backspace deletes every stop in the box as one step, and Undo and Redo take it back and forth', () => {
  const store = createStore(running());
  render(<App store={store} now={() => WAITING} />);
  const undo = screen.getByRole('button', { name: 'Undo' });
  const redo = screen.getByRole('button', { name: 'Redo' });
  expect(undo).toBeDisabled();
  expect(redo).toBeDisabled();
  boxAround(/^Dentist/);
  act(() => {
    fireEvent.keyDown(window, { key: 'Backspace' });
  });
  expect(store.getState().stops.some((s) => s.id === 'dentist')).toBe(false);
  expect(box()).toBeNull();
  expect(undo).toBeEnabled();
  act(() => fireEvent.click(undo));
  expect(store.getState().stops.some((s) => s.id === 'dentist')).toBe(true);
  expect(redo).toBeEnabled();
  act(() => fireEvent.click(redo));
  expect(store.getState().stops.some((s) => s.id === 'dentist')).toBe(false);
});

test('Delete on a box holding a goal takes its whole line, and Ctrl+Z puts it all back', () => {
  const store = createStore(running());
  render(<App store={store} now={() => WAITING} />);
  const before = store.getState();
  boxAround(/^Wristband/);
  act(() => {
    fireEvent.keyDown(window, { key: 'Delete' });
  });
  expect(store.getState().tracks).toHaveLength(0);
  expect(store.getState().stops).toHaveLength(0);
  act(() => {
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
  });
  expect(store.getState()).toBe(before);
  act(() => {
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true, shiftKey: true });
  });
  expect(store.getState().tracks).toHaveLength(0);
});

test('Backspace with no box, or typed in a name field, deletes nothing', () => {
  const store = createStore(running());
  render(<App store={store} now={() => WAITING} />);
  const before = store.getState();
  act(() => {
    fireEvent.keyDown(window, { key: 'Backspace' });
  });
  expect(store.getState()).toBe(before);
  boxAround(/^Dentist/);
  drawLine();
  const field = screen.getByRole('textbox', { name: 'Line name' });
  const stops = store.getState().stops.length;
  act(() => {
    fireEvent.keyDown(field, { key: 'Backspace' });
  });
  expect(store.getState().stops).toHaveLength(stops);
});

test('a whole drag is one step for Undo', () => {
  const store = createStore(running());
  render(<App store={store} now={() => WAITING} />);
  const x = stopNamed(store, 'dentist').x;
  act(() => {
    const el = screen.getByRole('button', { name: /^Dentist/ });
    const at = { x: left(/^Dentist/), y: parseFloat(el.style.top) };
    fireEvent.pointerDown(el, { pointerId: 1, clientX: at.x, clientY: at.y });
    for (let i = 1; i <= 5; i++) fireEvent.pointerMove(el, { pointerId: 1, clientX: at.x + 20 * i, clientY: at.y });
    fireEvent.pointerUp(el, { pointerId: 1, clientX: at.x + 100, clientY: at.y });
  });
  expect(stopNamed(store, 'dentist').x).not.toBe(x);
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Undo' })));
  expect(stopNamed(store, 'dentist').x).toBe(x);
  expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
});

const pressed = (name: string) => screen.getByRole('button', { name }).getAttribute('aria-pressed');

test('a tap on a tile turns its brush on, a second tap turns it off, and another tile switches', () => {
  render(<App store={createStore(running())} now={() => WAITING} />);
  openTray();
  tapTile('Step');
  expect(pressed('Step')).toBe('true');
  expect(paper()).toHaveClass('brushing');
  tapTile('Today');
  expect(pressed('Step')).toBe('false');
  expect(pressed('Today')).toBe('true');
  tapTile('Today');
  expect(pressed('Today')).toBe('false');
  expect(paper()).not.toHaveClass('brushing');
});

test('drawing with the line brush shows the routed time while the stroke is in flight', () => {
  const store = createStore(running());
  render(<App store={store} now={() => WAITING} />);
  const scale = scaleOnScreen();
  openTray();
  tapTile('New line');
  act(() => {
    fireEvent.pointerDown(paper(), { pointerId: 1, clientX: 150, clientY: 650 });
    fireEvent.pointerMove(paper(), { pointerId: 1, clientX: 450, clientY: 700 });
  });
  // A 45 degree run over the short side, then straight: 50Ã‚Â·Ã¢Ë†Å¡2 + 250 screen px.
  const seconds = (50 * Math.SQRT2 + 250) / scale;
  expect(document.querySelector('.leg-time')).toHaveTextContent(formatSeconds(seconds));
  expect(document.querySelector('.day-ghost')).not.toBeNull();
  act(() => fireEvent.pointerUp(paper(), { pointerId: 1, clientX: 450, clientY: 700 }));
  expect(document.querySelector('.leg-time')).toBeNull();
  expect(document.querySelector('.day-ghost')).toBeNull();
  expect(store.getState().tracks).toHaveLength(2);
});

test('a tap with the line brush makes nothing', () => {
  const store = createStore(running());
  render(<App store={store} now={() => WAITING} />);
  openTray();
  tapTile('New line');
  act(() => tapOn(paper()));
  expect(store.getState().tracks).toHaveLength(1);
  expect(pressed('New line')).toBe('true'); // and the tray stays open
});

test('the step brush drops a stop on a tapped line and stays on for the next', () => {
  const store = createStore(running());
  render(<App store={store} now={() => WAITING} />);
  openTray();
  tapTile('Step');
  const at = midLeg();
  act(() => {
    fireEvent.pointerDown(paper(), { pointerId: 1, clientX: at.x, clientY: at.y });
    fireEvent.pointerUp(paper(), { pointerId: 1, clientX: at.x, clientY: at.y });
  });
  const stops = store.getState().tracks[0].stops;
  expect(stops).toHaveLength(3);
  const first = stops[1];
  expect(stopNamed(store, first).shape).toBe('circle');
  fireEvent.change(screen.getByRole('textbox', { name: 'Stop title' }), { target: { value: 'Order parts' } });
  const a = left(/^Dentist/);
  const b = left(/^Wristband/);
  const x = a + (b - a) * 0.8;
  act(() => {
    fireEvent.pointerDown(paper(), { pointerId: 1, clientX: x, clientY: at.y });
    fireEvent.pointerUp(paper(), { pointerId: 1, clientX: x, clientY: at.y });
  });
  expect(store.getState().tracks[0].stops).toHaveLength(4);
  expect(stopNamed(store, first).title).toBe('Order parts');
  expect(pressed('Step')).toBe('true');
});

test('a step brush tap off every line does nothing', () => {
  const store = createStore(running());
  render(<App store={store} now={() => WAITING} />);
  openTray();
  tapTile('Sub-goal');
  const before = store.getState();
  act(() => {
    fireEvent.pointerDown(paper(), { pointerId: 1, clientX: 150, clientY: 700 });
    fireEvent.pointerUp(paper(), { pointerId: 1, clientX: 150, clientY: 700 });
  });
  expect(store.getState()).toBe(before);
});

test('the Today brush draws the day through the stops it is dragged across', () => {
  const store = createStore(running());
  render(<App store={store} now={() => WAITING} />);
  openTray();
  tapTile('Today');
  const d = { x: left(/^Dentist/), y: parseFloat(screen.getByRole('button', { name: /^Dentist/ }).style.top) };
  act(() => stroke({ x: d.x - 40, y: d.y - 60 }, d));
  const day = store.getState().tracks.find((t) => t.day);
  expect(day?.stops[0]).toBe('dentist');
});

test('with a brush on, a drag that starts on a stop moves the stop', () => {
  const store = createStore(running());
  render(<App store={store} now={() => WAITING} />);
  openTray();
  tapTile('New line');
  const x = stopNamed(store, 'dentist').x;
  act(() => dragStop(/^Dentist/, 40, 0));
  expect(stopNamed(store, 'dentist').x).not.toBe(x);
  expect(store.getState().tracks).toHaveLength(1);
});

test('shift-drag with a brush on still draws a box', () => {
  render(<App store={createStore(running())} now={() => WAITING} />);
  openTray();
  tapTile('New line');
  act(() => {
    fireEvent.pointerDown(paper(), { pointerId: 1, clientX: 100, clientY: 100, shiftKey: true });
    fireEvent.pointerMove(paper(), { pointerId: 1, clientX: 300, clientY: 250 });
  });
  expect(box()).toHaveClass('live');
});

test('Escape turns the brush off, but Escape in a name field keeps it', () => {
  render(<App store={createStore(running())} now={() => WAITING} />);
  drawLine();
  act(() => {
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Line name' }), { key: 'Escape' });
  });
  expect(pressed('New line')).toBe('true');
  act(() => {
    fireEvent.keyDown(window, { key: 'Escape' });
  });
  expect(pressed('New line')).toBe('false');
});

test('closing the tray turns the brush off', () => {
  render(<App store={createStore(running())} now={() => WAITING} />);
  openTray();
  tapTile('Step');
  openTray(); // the plus again: closes
  openTray();
  expect(pressed('Step')).toBe('false');
});

test('a pinch begun mid-stroke draws nothing', () => {
  const store = createStore(running());
  render(<App store={store} now={() => WAITING} />);
  openTray();
  tapTile('New line');
  act(() => {
    fireEvent.pointerDown(paper(), { pointerId: 1, clientX: 150, clientY: 650 });
    fireEvent.pointerMove(paper(), { pointerId: 1, clientX: 190, clientY: 650 });
    fireEvent.pointerDown(paper(), { pointerId: 2, clientX: 400, clientY: 650 });
  });
  expect(store.getState().tracks).toHaveLength(1);
  expect(document.querySelector('.day-ghost')).toBeNull();
  expect(document.querySelector('.leg-time')).toBeNull();
});

test('a drawn line is one undo step', () => {
  const store = createStore(running());
  render(<App store={store} now={() => WAITING} />);
  const before = store.getState();
  drawLine();
  act(() => {
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Line name' }), { key: 'Enter' });
  });
  // An empty name changes nothing, so it is no step: one Undo takes the line.
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Undo' })));
  expect(store.getState()).toBe(before);
});

test('Undo with an empty name field open takes back the stop and closes the field', () => {
  const store = createStore(running());
  render(<App store={store} now={() => WAITING} />);
  openTray();
  tapTile('Step');
  const at = midLeg();
  act(() => {
    fireEvent.pointerDown(paper(), { pointerId: 1, clientX: at.x, clientY: at.y });
    fireEvent.pointerUp(paper(), { pointerId: 1, clientX: at.x, clientY: at.y });
  });
  expect(store.getState().tracks[0].stops).toHaveLength(3);
  // A touchscreen's button tap does not blur the field: Undo has to settle it.
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Undo' })));
  expect(store.getState().tracks[0].stops).toHaveLength(2);
  expect(screen.queryByRole('textbox', { name: 'Stop title' })).not.toBeInTheDocument();
});

test('with a brush on, a tap inside the kept box keeps the tray open', () => {
  render(<App store={createStore(running())} now={() => WAITING} />);
  boxAround(/^Dentist/);
  openTray();
  tapTile('Step');
  act(() => tapOn(box()!));
  expect(pressed('Step')).toBe('true');
});

test('typing in the editor is one undo step, and Undo closes the editor', () => {
  vi.useFakeTimers();
  const store = createStore(running());
  render(<App store={store} now={() => WAITING} />);
  const title = stopNamed(store, 'dentist').title;
  openEditorOn(/^Dentist/);
  const input = screen.getByRole('textbox', { name: 'Stop title' });
  for (const v of [title + ' 3', title + ' 3p', title + ' 3pm']) fireEvent.change(input, { target: { value: v } });
  expect(stopNamed(store, 'dentist').title).toBe(title + ' 3pm');
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Undo' })));
  expect(stopNamed(store, 'dentist').title).toBe(title);
  expect(screen.queryByRole('group', { name: 'Edit stop' })).not.toBeInTheDocument();
});

test('Escape mid-stroke throws the stroke away', () => {
  const store = createStore(running());
  render(<App store={store} now={() => WAITING} />);
  openTray();
  tapTile('New line');
  act(() => {
    fireEvent.pointerDown(paper(), { pointerId: 1, clientX: 150, clientY: 650 });
    fireEvent.pointerMove(paper(), { pointerId: 1, clientX: 300, clientY: 650 });
    fireEvent.keyDown(window, { key: 'Escape' });
  });
  expect(document.querySelector('.day-ghost')).toBeNull();
  act(() => fireEvent.pointerUp(paper(), { pointerId: 1, clientX: 450, clientY: 650 }));
  expect(store.getState().tracks).toHaveLength(1);
});

test('Ctrl+Z waits while a drag is in flight', () => {
  const store = createStore(running());
  render(<App store={store} now={() => WAITING} />);
  const x = stopNamed(store, 'dentist').x;
  const el = screen.getByRole('button', { name: /^Dentist/ });
  const at = { x: left(/^Dentist/), y: parseFloat(el.style.top) };
  act(() => {
    fireEvent.pointerDown(el, { pointerId: 1, clientX: at.x, clientY: at.y });
    fireEvent.pointerMove(el, { pointerId: 1, clientX: at.x + 40, clientY: at.y });
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
  });
  const moved = stopNamed(store, 'dentist').x;
  expect(moved).not.toBe(x); // the drag was not taken back under the hand
  act(() => {
    fireEvent.pointerMove(el, { pointerId: 1, clientX: at.x + 80, clientY: at.y });
    fireEvent.pointerUp(el, { pointerId: 1, clientX: at.x + 80, clientY: at.y });
  });
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Undo' })));
  expect(stopNamed(store, 'dentist').x).toBe(x); // still one step
});

test("an undo past midnight never brings back yesterday's day", () => {
  const world = dayOn(WAITING);
  const store = createStore(world);
  const project = world.tracks.find((t) => !t.day)!;
  store.dispatch({ type: 'cycleTarget', trackId: project.id }); // a step whose before still holds the day
  const tomorrow = WAITING + 2 * 86_400_000;
  render(<App store={store} now={() => tomorrow} />);
  expect(store.getState().tracks.some((t) => t.day)).toBe(false); // the opening tick cleared it
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Undo' })));
  expect(store.getState().tracks.some((t) => t.day)).toBe(false);
});

test('the lit tile keeps a visible focus ring', () => {
  expect(uiCss).toMatch(/\.tile\[aria-pressed='true'\]:focus-visible\s*\{[^}]*outline-color:\s*var\(--ink\)/);
});

test("Escape on a new line's name leaves no line and nothing to undo or redo", () => {
  const store = createStore(running());
  render(<App store={store} now={() => WAITING} />);
  drawLine();
  act(() => {
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Line name' }), { key: 'Escape' });
  });
  expect(store.getState().tracks).toHaveLength(1);
  expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Redo' })).toBeDisabled();
});

describe('the week window', () => {
  const t = () => WAITING;
  const weekButton = () => screen.getByRole('button', { name: 'Week' });
  const dialog = () => screen.queryByRole('dialog', { name: 'Week' });

  test('opens from its button on tomorrow, and closes from it', () => {
    render(<App store={createStore(running())} now={t} />);
    expect(dialog()).toBeNull();
    act(() => weekButton().click());
    expect(dialog()).toBeInTheDocument();
    expect(weekButton()).toHaveAttribute('aria-expanded', 'true');
    const tomorrow = document.querySelector('[data-week-day][aria-pressed="true"]')!;
    expect(tomorrow.getAttribute('data-week-day')! > dayOf(WAITING)).toBe(true);
    act(() => weekButton().click());
    expect(dialog()).toBeNull();
  });

  test('Escape closes it, and so does a tap on the plane', () => {
    render(<App store={createStore(running())} now={t} />);
    act(() => weekButton().click());
    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });
    expect(dialog()).toBeNull();
    act(() => weekButton().click());
    act(() => tapOn(paper()));
    expect(dialog()).toBeNull();
  });

  test('a wheel over the day plane never zooms the map', () => {
    render(<App store={createStore(running())} now={t} />);
    act(() => weekButton().click());
    const before = left(/^Dentist/);
    fireEvent.wheel(screen.getByLabelText('Day plane'), { deltaY: -400, clientX: 500, clientY: 400 });
    expect(left(/^Dentist/)).toBe(before);
    // The same wheel on the plane does zoom it.
    fireEvent.wheel(paper(), { deltaY: -400, clientX: 500, clientY: 400 });
    expect(left(/^Dentist/)).not.toBe(before);
  });

  test('opening it puts the brush down', () => {
    render(<App store={createStore(running())} now={t} />);
    openTray();
    tapTile('Step');
    expect(screen.getByRole('button', { name: 'Step' })).toHaveAttribute('aria-pressed', 'true');
    act(() => weekButton().click());
    expect(screen.getByRole('button', { name: 'Step' })).toHaveAttribute('aria-pressed', 'false');
  });
});

test('the plane draws no line for a day after tomorrow, nor its end square', () => {
  const w = withWeek(dayOf(WAITING));
  w.tracks.find((t) => t.id === 'day2')!.day!.date = addDays(dayOf(WAITING), 2);
  render(<App store={createStore(w)} now={() => WAITING} />);
  expect(document.querySelector('[data-target="origin"][data-track="day"]')).toBeInTheDocument();
  expect(document.querySelector('[data-target="origin"][data-track="day2"]')).toBeNull();
  expect(document.querySelector('[data-id="dayEnd2"]')).toBeNull();
});

describe('the map behind the week window', () => {
  const weekButton = () => screen.getByRole('button', { name: 'Week' });
  const dialog = () => screen.queryByRole('dialog', { name: 'Week' });
  const escape = () =>
    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });
  /** Moves Dentist 500 s along and 300 s down in the store, as the window does to a stop it places. */
  const moveDentist = (store: ReturnType<typeof createStore>) =>
    act(() => store.dispatch({ type: 'move', id: 'dentist', x: 1500, y: 300, now: WAITING }));

  /** Animation frames run by hand: `frame(t)` runs the frames asked for so far at time t ms. */
  function handFrames() {
    let asked = new Map<number, FrameRequestCallback>();
    let next = 0;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      asked.set(++next, cb);
      return next;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
      asked.delete(id);
    });
    return (t: number) =>
      act(() => {
        const due = [...asked.values()];
        asked = new Map();
        for (const cb of due) cb(t);
      });
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('holds still while the window is open, then slides each moved stop into place when it closes', () => {
    const frame = handFrames();
    const store = createStore(running());
    render(<App store={store} now={() => WAITING} />);
    const scale = scaleOnScreen();
    const before = left(/^Dentist/);
    act(() => weekButton().click());
    moveDentist(store);
    expect(left(/^Dentist/)).toBe(before);
    escape();
    expect(dialog()).toBeNull();
    frame(1000);
    expect(left(/^Dentist/)).toBe(before);
    frame(1200);
    const partway = left(/^Dentist/);
    expect(partway).toBeGreaterThan(before);
    expect(partway).toBeLessThan(before + 500 * scale);
    frame(1500);
    expect(left(/^Dentist/)).toBeCloseTo(before + 500 * scale, 6);
  });

  test('under reduced motion the stops are in place as soon as the window closes', () => {
    reduceMotion();
    const store = createStore(running());
    render(<App store={store} now={() => WAITING} />);
    const scale = scaleOnScreen();
    const before = left(/^Dentist/);
    act(() => weekButton().click());
    moveDentist(store);
    escape();
    expect(left(/^Dentist/)).toBeCloseTo(before + 500 * scale, 6);
  });

  test('a day line made while the window is open is drawn once the slide ends', () => {
    const frame = handFrames();
    const store = createStore(running());
    render(<App store={store} now={() => WAITING} />);
    const origin = () => document.querySelector('[data-target="origin"][data-track="made"]');
    act(() => weekButton().click());
    moveDentist(store);
    act(() =>
      store.dispatch({
        type: 'newDay',
        id: 'made',
        endId: 'madeEnd',
        origin: { x: 1500, y: 0 },
        stops: ['dentist'],
        end: { x: 1500, y: 600 },
        now: WAITING,
        date: dayOf(WAITING),
      }),
    );
    expect(store.getState().tracks.some((t) => t.id === 'made')).toBe(true);
    expect(origin()).toBeNull();
    escape();
    frame(0);
    frame(250);
    expect(origin()).toBeNull();
    frame(500);
    expect(origin()).toBeInTheDocument();
  });

  test('a drag on the plane while the window is open closes it and moves nothing', () => {
    const store = createStore(running());
    render(<App store={store} now={() => WAITING} />);
    act(() => weekButton().click());
    act(() => dragStop(/^Dentist/, 50, 30));
    expect(dialog()).toBeNull();
    expect(stopNamed(store, 'dentist')).toMatchObject({ x: 1000, y: 0 });
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
  });

  test('a drag while the map slides moves nothing, and one after it moves the stop as ever', () => {
    const frame = handFrames();
    const store = createStore(running());
    render(<App store={store} now={() => WAITING} />);
    act(() => weekButton().click());
    moveDentist(store);
    escape();
    frame(0);
    act(() => dragStop(/^Dentist/, 50, 30));
    expect(stopNamed(store, 'dentist')).toMatchObject({ x: 1500, y: 300 });
    frame(500);
    act(() => dragStop(/^Dentist/, 50, 30));
    expect(stopNamed(store, 'dentist').x).toBeGreaterThan(1500);
  });

  test('opening the window again mid-slide shows every stop where it stands now', () => {
    const frame = handFrames();
    const store = createStore(running());
    render(<App store={store} now={() => WAITING} />);
    const scale = scaleOnScreen();
    const before = left(/^Dentist/);
    act(() => weekButton().click());
    moveDentist(store);
    escape();
    frame(0);
    frame(200);
    act(() => weekButton().click());
    expect(left(/^Dentist/)).toBeCloseTo(before + 500 * scale, 6);
    frame(600);
    expect(left(/^Dentist/)).toBeCloseTo(before + 500 * scale, 6);
  });

  test('a tap on a stop while the window is open still completes it', () => {
    const store = createStore(running());
    render(<App store={store} now={() => WAITING} />);
    act(() => weekButton().click());
    act(() => tapOn(screen.getByRole('button', { name: /^Dentist/ })));
    expect(stopNamed(store, 'dentist').done).toBe(true);
  });
});

describe('the life line bubble', () => {
  const LONG_AFTER = 1e13;

  /**
   * Start done, the life train on its leg into Far (x 5e9, off screen), and Wristband, t1's goal,
   * a ring further right. The camera opens on t1, so Far is out of sight to the right.
   */
  function lifeOffScreen() {
    const world = withLife();
    const life = world.tracks.find((t) => t.life)!;
    world.stops.find((s) => s.id === 'start')!.done = true;
    world.stops.find((s) => s.id === 'far')!.x = 5e9;
    world.stops.find((s) => s.id === 'wristband')!.x = 1e10;
    life.stops = ['start', 'far', 'wristband'];
    life.train = { leg: 1, departedAt: 0 };
    return world;
  }
  const lifeBubble = () => document.querySelector('[data-target="bubble"][data-track="life"]') as HTMLElement | null;

  test('is in ink, names the next undone square, and is filled while the life train waits there', () => {
    render(<App store={createStore(lifeOffScreen())} now={() => LONG_AFTER} />);
    const bubble = lifeBubble()!;
    expect(bubble).toHaveAccessibleName(/^Far, goal/);
    expect(bubble.style.getPropertyValue('--track-color')).toBe('var(--ink)');
    expect(bubble).toHaveClass('soonest');
  });

  test('is not filled while the life train is still rolling', () => {
    render(<App store={createStore(lifeOffScreen())} now={() => 1000} />);
    expect(lifeBubble()).not.toHaveClass('soonest');
  });

  test('a tap cycles its target between the next square and the last, never through a sub-goal', () => {
    const store = createStore(lifeOffScreen());
    render(<App store={store} now={() => LONG_AFTER} />);
    const life = () => store.getState().tracks.find((t) => t.life)!;
    expect(life().target).toBe('next');
    act(() => tapOn(lifeBubble()!));
    expect(life().target).toBe('goal');
    expect(lifeBubble()).toHaveAccessibleName(/^Wristband, goal/);
    act(() => tapOn(lifeBubble()!));
    expect(life().target).toBe('next');
  });

  test('a picture bubble flies to its marker and lands no wider than the 1-year unit', () => {
    reduceMotion();
    const world = withLife();
    const life = world.tracks.find((t) => t.life)!;
    world.tracks = world.tracks.filter((t) => t.id !== 't1');
    life.stops = ['start', 'far'];
    life.life = { y: -800, budgets: [0, 0] };
    life.target = 'goal';
    const far = world.stops.find((s) => s.id === 'far')!;
    far.x = 3e9;
    far.image = PICTURE;
    render(<App store={createStore(world)} now={() => 100_000} />);
    for (let i = 0; i < 40 && document.querySelector('.legend')!.textContent !== '5 years'; i++) {
      act(() => {
        fireEvent.wheel(paper(), { clientX: 500, clientY: 400, deltaY: 2500 });
      });
    }
    expect(document.querySelector('.legend')!.textContent).toBe('5 years');
    expect(lifeBubble()).toHaveClass('picture');
    act(() => tapOn(lifeBubble()!));
    expect(document.querySelector('.legend')!.textContent).toBe('1 year');
    expect(screen.getByRole('button', { name: /^Far/ })).toBeInTheDocument();
  });

  test('from the 1-year unit up the bubble passes over the rings the level does not draw', () => {
    const world = withLife();
    const life = world.tracks.find((t) => t.life)!;
    // Start done and the life train heading for Wristband, a ring: from the 1-year unit up it is
    // not drawn, so the bubble points at Far, the next bare marker.
    world.stops.find((s) => s.id === 'start')!.done = true;
    world.stops.find((s) => s.id === 'far')!.x = 3e9;
    life.train = { leg: 1, departedAt: 0 };
    render(<App store={createStore(world)} now={() => 100_000} />);
    for (let i = 0; i < 400 && document.querySelector('.legend')!.textContent !== '1 year'; i++) {
      act(() => {
        fireEvent.wheel(paper(), { clientX: 500, clientY: 400, deltaY: 100 });
      });
    }
    expect(document.querySelector('.legend')!.textContent).toBe('1 year');
    expect(lifeBubble()).toHaveAccessibleName(/^Far, goal/);
  });

  test('tap-to-fit on a project line never zooms wider than the 30-day unit', () => {
    reduceMotion();
    const world = running();
    world.stops[1].x = 1e9;
    world.stops[1].image = PICTURE;
    render(<App store={createStore(world)} now={() => 500_000} />);
    act(() => tapOn(document.querySelector('[data-target="bubble"]')!));
    expect(document.querySelector('.legend')!.textContent).toBe('30 days');
  });
});

describe('life line gestures', () => {
  const LIFE_NOW = 1000;
  /** Screen pixels per world second at the opening: the leg to Dentist fits a third of the width. */
  const SCALE = 1 / 3;

  /** withLife with its squares brought in so they are all on screen at the opening. */
  function lifeScene(): ReturnType<typeof withLife> {
    const world = withLife();
    const place = (id: string, x: number) => {
      world.stops.find((s) => s.id === id)!.x = x;
    };
    place('start', 600);
    place('wristband', 1100);
    place('far', 1400);
    return world;
  }

  /**
   * lifeScene and a second line t2, below the first, whose goal Goal two is not on the life line:
   * a step at (800, 300) and the goal at (900, 300). The camera still opens on t1, the project
   * heading for the first ring.
   */
  function joinScene(): ReturnType<typeof withLife> {
    const world = lifeScene();
    world.tracks.push({ id: 't2', color: 1, origin: { x: 0, y: 300 }, stops: ['s2', 'g2'], train: { leg: 0, departedAt: 0 }, target: 'goal' });
    world.stops.push(
      { id: 's2', title: 'Step two', shape: 'circle', size: 'medium', x: 800, y: 300, done: false },
      { id: 'g2', title: 'Goal two', shape: 'square', size: 'large', x: 900, y: 300, done: false },
    );
    return world;
  }

  const lifeOf = (store: ReturnType<typeof createStore>) => store.getState().tracks.find((t) => t.life)!;
  const ghost = () => document.querySelector<HTMLElement>('.ghost');
  /** The screen point on the life line at a world x, a few pixels off the line. */
  const onLifeLine = (x: number) => ({ x: at(/^Start/).x + (x - 600) * SCALE, y: at(/^Start/).y + 6 });

  /** Presses a tile and moves it to a screen point, leaving the finger down; the returned function lets go. */
  function carry(name: string, to: { x: number; y: number }) {
    const tile = screen.getByRole('button', { name });
    fireEvent.pointerDown(tile, { pointerId: 1, clientX: 900, clientY: 740 });
    fireEvent.pointerMove(tile, { pointerId: 1, clientX: to.x, clientY: to.y });
    return () => fireEvent.pointerUp(tile, { pointerId: 1, clientX: to.x, clientY: to.y });
  }

  test('the tray has no Marker tile: nothing goes on the life line alone', () => {
    const store = createStore(lifeScene());
    render(<App store={store} now={() => LIFE_NOW} />);
    openTray();
    expect(screen.queryByRole('button', { name: 'Marker' })).not.toBeInTheDocument();
    expect(lifeOf(store).stops).toEqual(['start', 'wristband', 'far']);
  });

  test('a Step or a Sub-goal dropped on the life line adds nothing and its ghost is muted', () => {
    const store = createStore(lifeScene());
    render(<App store={store} now={() => LIFE_NOW} />);
    openTray();
    const before = store.getState();
    for (const tile of ['Step', 'Sub-goal']) {
      let drop = () => {};
      act(() => {
        drop = carry(tile, onLifeLine(1250));
      });
      expect(ghost()).not.toHaveClass('snapped');
      act(() => drop());
      expect(store.getState()).toBe(before);
    }
  });

  test("a goal released on the life line right of the train joins it as a ring, and the project's steps keep their places", () => {
    const store = createStore(joinScene());
    render(<App store={store} now={() => LIFE_NOW} />);
    const before = store.getState();
    const step = stopNamed(store, 's2');
    const goal = at(/^Goal two/);
    // Up to the life line, 30 px to the right: world x 990, between Start (600) and Wristband (1100).
    act(() => dragStop(/^Goal two/, 30, at(/^Start/).y - goal.y));
    expect(lifeOf(store).stops).toEqual(['start', 'g2', 'wristband', 'far']);
    expect(stopNamed(store, 'g2')).toMatchObject({ y: -800 });
    expect(stopNamed(store, 'g2').x).toBeCloseTo(900 + 30 / SCALE, 6);
    // Only the goal moved: the drag scaled the step while it was held, and the release put it back.
    expect(stopNamed(store, 's2')).toEqual(step);
    expect(store.getState().tracks.find((t) => t.id === 't2')!.stops).toEqual(['s2', 'g2']);
    // The whole drag and join is one step for undo.
    act(() => store.undo());
    expect(store.getState()).toEqual(before);
  });

  test('a goal released off the life line scales its line and joins nothing, as before', () => {
    const store = createStore(joinScene());
    render(<App store={store} now={() => LIFE_NOW} />);
    act(() => dragStop(/^Goal two/, 60, 40));
    expect(lifeOf(store).stops).toEqual(['start', 'wristband', 'far']);
    expect(stopNamed(store, 's2').x).not.toBe(800);
  });

  test("a ring dragged along the life line, within a snap of it, keeps its height, shows the life leg's time and moves nothing else", () => {
    const store = createStore(lifeScene());
    render(<App store={store} now={() => LIFE_NOW} />);
    const dentist = stopNamed(store, 'dentist');
    const el = screen.getByRole('button', { name: /^Wristband/ });
    const from = { x: parseFloat(el.style.left) + 4, y: parseFloat(el.style.top) };
    act(() => {
      fireEvent.pointerDown(el, { pointerId: 1, clientX: from.x, clientY: from.y });
      fireEvent.pointerMove(el, { pointerId: 1, clientX: from.x + 30, clientY: from.y + 15 });
    });
    const wristband = stopNamed(store, 'wristband');
    expect(wristband.y).toBe(-800);
    expect(wristband.x).toBeCloseTo(1100 + 30 / SCALE, 6);
    // The life leg into Wristband runs from Start at 600.
    expect(document.querySelector('.leg-time')!.textContent).toBe(formatSeconds(wristband.x - 600));
    act(() => fireEvent.pointerUp(el, { pointerId: 1, clientX: from.x + 30, clientY: from.y + 15 }));
    expect(stopNamed(store, 'dentist')).toEqual(dentist);
    expect(stopNamed(store, 'start').x).toBe(600);
    expect(lifeOf(store).stops).toEqual(['start', 'wristband', 'far']);
    expect(document.querySelector('.leg-time')).toBeNull();
  });

  test('a ring dragged off the life line leaves it and stays its project goal where it was let go, in one undo step', () => {
    const store = createStore(lifeScene());
    render(<App store={store} now={() => LIFE_NOW} />);
    const before = store.getState();
    act(() => dragStop(/^Wristband/, 0, 120));
    expect(lifeOf(store).stops).toEqual(['start', 'far']);
    expect(store.getState().tracks.find((t) => t.id === 't1')!.stops.at(-1)).toBe('wristband');
    expect(stopNamed(store, 'wristband').y).toBeCloseTo(-800 + 120 / SCALE, 6);
    act(() => store.undo());
    expect(store.getState()).toEqual(before);
  });

  test('a ring pulled past a snap but short of three snaps from the life line stays on it', () => {
    const store = createStore(lifeScene());
    render(<App store={store} now={() => LIFE_NOW} />);
    // 60 px: past the 24 px snap, short of the 72 px pull-off.
    act(() => dragStop(/^Wristband/, 30, 60));
    expect(lifeOf(store).stops).toEqual(['start', 'wristband', 'far']);
    expect(stopNamed(store, 'wristband')).toMatchObject({ y: -800 });
    expect(stopNamed(store, 'wristband').x).toBeCloseTo(1100 + 30 / SCALE, 6);
  });

  /** Presses a stop and moves the finger by (dx, dy), leaving it down; the returned function lets go there. */
  function hold(name: RegExp, dx: number, dy: number) {
    const el = screen.getByRole('button', { name });
    const x = parseFloat(el.style.left) + 4;
    const y = parseFloat(el.style.top);
    fireEvent.pointerDown(el, { pointerId: 1, clientX: x, clientY: y });
    fireEvent.pointerMove(el, { pointerId: 1, clientX: x + dx, clientY: y + dy });
    return () => fireEvent.pointerUp(el, { pointerId: 1, clientX: x + dx, clientY: y + dy });
  }
  const leanOf = (id: string) => document.querySelector<HTMLElement>(`.stop[data-id="${id}"]`)!.style.getPropertyValue('--lean');

  test('a ring held on the life line leans toward the finger by a quarter of the pull, and springs back when let go', () => {
    render(<App store={createStore(lifeScene())} now={() => LIFE_NOW} />);
    let release = () => {};
    act(() => {
      release = hold(/^Wristband/, 0, 40);
    });
    expect(leanOf('wristband')).toBe('10px');
    expect(document.querySelector('.stop[data-id="wristband"]')).toHaveClass('leaning');
    act(() => release());
    expect(leanOf('wristband')).toBe('');
    expect(document.querySelector('.stop[data-id="wristband"]')).not.toHaveClass('leaning');
  });

  test('a marker pulled far from the life line leans no further than a ring could, and stays on', () => {
    const store = createStore(lifeScene());
    render(<App store={store} now={() => LIFE_NOW} />);
    let release = () => {};
    act(() => {
      release = hold(/^Far/, 0, 200);
    });
    // A quarter of the 72 px pull-off, the most a ring leans before it comes off.
    expect(leanOf('far')).toBe('18px');
    act(() => release());
    expect(lifeOf(store).stops).toContain('far');
    expect(leanOf('far')).toBe('');
  });

  test('a ring pulled off the life line stops leaning and follows the finger', () => {
    render(<App store={createStore(lifeScene())} now={() => LIFE_NOW} />);
    act(() => {
      hold(/^Wristband/, 0, 120);
    });
    expect(leanOf('wristband')).toBe('');
  });

  test('a goal carried in snap reach of the life line shows no preview of where it will land, and let go there it joins', () => {
    const store = createStore(joinScene());
    render(<App store={store} now={() => LIFE_NOW} />);
    const goalId = store.getState().stops.find((s) => s.title === 'Goal two')!.id;
    const lineY = at(/^Start/).y;
    const goal = at(/^Goal two/);
    let release = () => {};
    // To 10 px below the line, 30 px right: world x 990, between Start and Wristband.
    act(() => {
      release = hold(/^Goal two/, 30, lineY - goal.y + 10);
    });
    expect(document.querySelector('.ghost')).toBeNull();
    act(() => release());
    expect(document.querySelector('.ghost')).toBeNull();
    expect(lifeOf(store).stops).toContain(goalId);
  });

  test('a stop leans by translate, which springs back only once let go', () => {
    expect(cssRule('.stop')).toMatch(/translate:\s*0 var\(--lean, 0px\)/);
    expect(cssRule('.stop:not(.leaning)')).toMatch(/transition:\s*translate 150ms ease-out/);
  });

  test('a ring pulled off the life line and let go back on it joins it again at its new x', () => {
    const store = createStore(lifeScene());
    render(<App store={store} now={() => LIFE_NOW} />);
    const el = screen.getByRole('button', { name: /^Wristband/ });
    const from = { x: parseFloat(el.style.left) + 4, y: parseFloat(el.style.top) };
    act(() => {
      fireEvent.pointerDown(el, { pointerId: 1, clientX: from.x, clientY: from.y });
      fireEvent.pointerMove(el, { pointerId: 1, clientX: from.x, clientY: from.y + 120 });
      fireEvent.pointerMove(el, { pointerId: 1, clientX: from.x + 30, clientY: from.y + 6 });
      fireEvent.pointerUp(el, { pointerId: 1, clientX: from.x + 30, clientY: from.y + 6 });
    });
    expect(lifeOf(store).stops).toEqual(['start', 'wristband', 'far']);
    expect(stopNamed(store, 'wristband')).toMatchObject({ y: -800 });
    expect(stopNamed(store, 'wristband').x).toBeCloseTo(1100 + 30 / SCALE, 6);
  });

  test('a ring on the life line looks like any goal: a disc with its square, not a transfer capsule', () => {
    render(<App store={createStore(lifeScene())} now={() => LIFE_NOW} />);
    const ring = document.querySelector('[data-id="wristband"]')!;
    expect(ring.querySelector('.shape')).toHaveClass('square');
    expect(ring.querySelector('.shape')).not.toHaveClass('ring');
    expect(ring.querySelector('.link')).toBeNull();
    expect(ring).not.toHaveClass('linked');
  });

  test("the life train waiting at a project's goal is not drawn, so the goal reads as lying on the line; at a bare marker it is", () => {
    const lifeTrain = () => [...document.querySelectorAll<SVGElement>('svg.track')].find((t) => !t.querySelector('path.casing'))!.querySelector<SVGElement>('[data-train]')!;
    const atRing = lifeScene();
    atRing.stops.find((s) => s.id === 'start')!.done = true;
    atRing.tracks.find((t) => t.life)!.train = { leg: 1, departedAt: 0 };
    const first = render(<App store={createStore(atRing)} now={() => LIFE_NOW} />);
    expect(lifeTrain().style.visibility).toBe('hidden');
    first.unmount();
    render(<App store={createStore(lifeScene())} now={() => LIFE_NOW} />);
    expect(lifeTrain().style.visibility).toBe('');
  });

  test("a ring's disc is the colour of the project ending there, with its white square; the project line lies on the life line with no paper rim", () => {
    const world = lifeScene();
    // A green project, unlike the life line's own slot 0, which is blue; and the life line made first, as a real one is.
    world.tracks.find((t) => t.id === 't1')!.color = 2;
    world.tracks = [...world.tracks.filter((t) => t.life), ...world.tracks.filter((t) => !t.life)];
    // A blue project passes through it on the way to its own goal, and is next there: the tap
    // speaks for it, but the disc stays the colour of the line that ends there.
    world.stops.push({ id: 'g9', title: 'Nine', shape: 'square', size: 'large', x: 1300, y: -400, done: false });
    world.tracks.push({ id: 't9', color: 0, origin: { x: 900, y: -400 }, stops: ['wristband', 'g9'], train: { leg: 0, departedAt: 0 }, target: 'goal' });
    render(<App store={createStore(world)} now={() => LIFE_NOW} />);
    const ring = document.querySelector<HTMLElement>('.stop[data-id="wristband"]')!;
    expect(ring).toHaveClass('on-life');
    expect(ring.style.getPropertyValue('--home-color')).toBe('var(--track-green)');
    // As a transfer too, the disc inside the paper capsule takes the colour, not the ink.
    expect(/\.stop\.on-life \.shape\.ring::before,/.test(uiCss)).toBe(true);
    expect(document.querySelector('.stop[data-id="start"]')).not.toHaveClass('on-life');
    // Its colour at rest, pressed and focused, never the ink.
    const rule = /\.stop\.on-life \.shape:not\(\.dot\),\s*\.stop\.on-life:focus-visible \.shape:not\(\.dot\),\s*\.stop\.on-life:active \.shape:not\(\.dot\)\s*\{([^}]*)\}/.exec(uiCss)?.[1];
    expect(rule).toMatch(/background:\s*var\(--home-color\)/);
    expect(uiCss).not.toMatch(/\.stop\.on-life[^{]*\{[^}]*background:\s*var\(--ink\)/);
    // The square inside stays paper white.
    expect(/\.stop \.disc\.square::after\s*\{([^}]*)\}/.exec(uiCss)?.[1]).toMatch(/background:\s*var\(--paper\)/);
    // The project line is drawn after the life line, over it, and its casing leaves out the life line's band.
    const tracks = [...document.querySelectorAll('svg.track')];
    const lifeAt = tracks.findIndex((t) => !t.querySelector('path.casing'));
    expect(lifeAt).toBe(0);
    const casing = tracks[1].querySelector('path.casing')!;
    const clip = tracks[1].querySelector(`clipPath#${casing.getAttribute('clip-path')!.slice(5, -1)}`)!;
    const [above, below] = [...clip.querySelectorAll('rect')].map((r) => ({ y: Number(r.getAttribute('y')), h: Number(r.getAttribute('height')) }));
    expect(below.y - (above.y + above.h)).toBeCloseTo(LIFE_WIDTH);
  });

  test('a bare marker dragged along the life line keeps its height and changes its x, and may pass its neighbour', () => {
    const store = createStore(lifeScene());
    render(<App store={store} now={() => LIFE_NOW} />);
    act(() => dragStop(/^Far/, -120, 50));
    expect(stopNamed(store, 'far')).toMatchObject({ y: -800 });
    expect(stopNamed(store, 'far').x).toBeCloseTo(1400 - 120 / SCALE, 6);
    expect(lifeOf(store).stops).toEqual(['start', 'far', 'wristband']);
  });

  test('a marker dragged left of the life train stops at the train and does not pass it', () => {
    const store = createStore(lifeScene());
    render(<App store={store} now={() => LIFE_NOW} />);
    const { x, y } = at(/^Far/);
    const el = screen.getByRole('button', { name: /^Far/ });
    act(() => {
      fireEvent.pointerDown(el, { pointerId: 1, clientX: x, clientY: y });
      fireEvent.pointerMove(el, { pointerId: 1, clientX: x - 150, clientY: y });
      fireEvent.pointerMove(el, { pointerId: 1, clientX: x - 600, clientY: y });
      fireEvent.pointerUp(el, { pointerId: 1, clientX: x - 600, clientY: y });
    });
    // The second move would have put it at x = -400, behind the train at about x = 1.
    expect(stopNamed(store, 'far').x).toBeCloseTo(1400 - 150 / SCALE, 6);
  });

  test('a marker released near a project line does not join it', () => {
    const store = createStore(lifeScene());
    render(<App store={store} now={() => LIFE_NOW} />);
    const to = { x: at(/^Dentist/).x - 100, y: at(/^Dentist/).y + 6 };
    const from = at(/^Far/);
    const el = screen.getByRole('button', { name: /^Far/ });
    act(() => {
      fireEvent.pointerDown(el, { pointerId: 1, clientX: from.x, clientY: from.y });
      fireEvent.pointerMove(el, { pointerId: 1, clientX: to.x, clientY: to.y });
      fireEvent.pointerUp(el, { pointerId: 1, clientX: to.x, clientY: to.y });
    });
    expect(store.getState().tracks.find((t) => t.id === 't1')!.stops).toEqual(['dentist', 'wristband']);
  });

  test('the sun dragged through a ring or a marker does not pick either up', () => {
    const store = createStore(lifeScene());
    render(<App store={store} now={() => LIFE_NOW} />);
    openTray();
    const before = store.getState();
    const sun = screen.getByRole('button', { name: 'Today' });
    const ring = at(/^Wristband/);
    const marker = at(/^Far/);
    act(() => {
      fireEvent.pointerDown(sun, point(900, 740));
      fireEvent.pointerMove(sun, point(ring.x, ring.y));
      fireEvent.pointerMove(sun, point(marker.x, marker.y));
      fireEvent.pointerUp(sun, point(marker.x, marker.y + 80));
    });
    expect(store.getState()).toBe(before);
  });

  test('a box over a marker and a project stop moves the marker along the life line and the stop both ways', () => {
    const store = createStore(lifeScene());
    render(<App store={store} now={() => LIFE_NOW} />);
    const dentist = at(/^Dentist/);
    const marker = at(/^Far/);
    act(() => drawBox(dentist.x - 30, marker.y - 30, marker.x + 30, dentist.y + 30));
    expect(box()).not.toBeNull();
    act(() => dragOn(box()!, dentist.x, dentist.y, 30, 60));
    expect(stopNamed(store, 'far').x).toBeCloseTo(1400 + 30 / SCALE, 6);
    expect(stopNamed(store, 'far').y).toBe(-800);
    expect(stopNamed(store, 'dentist').x).toBeCloseTo(1000 + 30 / SCALE, 6);
    expect(stopNamed(store, 'dentist').y).toBeCloseTo(60 / SCALE, 6);
  });

  test('a box over the life line start catches no start to carry', () => {
    const store = createStore(lifeScene());
    render(<App store={store} now={() => LIFE_NOW} />);
    const start = at(/^Start/);
    // The life line's start is at world x 0, the left of Start by 600 s.
    const origin = { x: start.x - 600 * SCALE, y: start.y };
    act(() => drawBox(origin.x - 30, origin.y - 30, start.x + 30, origin.y + 30));
    act(() => dragOn(box()!, start.x, start.y, 0, 60));
    expect(lifeOf(store).origin).toEqual({ x: 0, y: -800 });
    expect(stopNamed(store, 'start').y).toBe(-800);
  });

  test('a step split off a ring cannot be dropped on the life line', () => {
    const store = createStore(lifeScene());
    render(<App store={store} now={() => LIFE_NOW} />);
    const before = store.getState();
    act(() => splitFrom(/^Wristband/, onLifeLine(1250)));
    expect(store.getState()).toBe(before);
  });

  describe('the editor on a ring', () => {
    /** lifeScene with Far before Wristband, so Wristband is the rightmost square. */
    function ringLast() {
      const world = lifeScene();
      world.stops.find((s) => s.id === 'far')!.x = 1000;
      world.stops.find((s) => s.id === 'wristband')!.x = 1400;
      world.tracks.find((t) => t.life)!.stops = ['start', 'far', 'wristband'];
      return world;
    }

    test('shows a Life chip in ink, the rightmost ring included, and tapping it takes the goal off the life line', () => {
      vi.useFakeTimers();
      const store = createStore(ringLast());
      render(<App store={store} now={() => LIFE_NOW} />);
      openEditorOn(/^Wristband/);
      const chip = screen.getByRole('button', { name: 'Leave Life' });
      expect(chip.style.getPropertyValue('--track-color')).toBe('var(--ink)');
      // Its own line is not a chip: a goal cannot leave it.
      expect(screen.getAllByRole('button').filter((b) => b.classList.contains('line-chip'))).toHaveLength(1);
      act(() => chip.click());
      expect(lifeOf(store).stops).toEqual(['start', 'far']);
      expect(store.getState().tracks.find((t) => t.id === 't1')!.stops).toEqual(['dentist', 'wristband']);
      expect(stopNamed(store, 'wristband')).toMatchObject({ x: 1400, y: -800 });
    });

    test('a ring in the middle of the life line shows it too, and a bare marker shows none', () => {
      vi.useFakeTimers();
      render(<App store={createStore(lifeScene())} now={() => LIFE_NOW} />);
      openEditorOn(/^Wristband/);
      expect(screen.getByRole('button', { name: 'Leave Life' })).toBeInTheDocument();
      cleanup();
      render(<App store={createStore(lifeScene())} now={() => LIFE_NOW} />);
      openEditorOn(/^Far/);
      expect(screen.queryByRole('button', { name: /^Leave/ })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    });
  });

  test('a screen reader tells a goal on the life line from a marker, and says both are on it', () => {
    render(<App store={createStore(joinScene())} now={() => LIFE_NOW} />);
    const nameOf = (id: string) => document.querySelector(`.stop[data-id="${id}"]`)!.getAttribute('aria-label');
    expect(nameOf('wristband')).toMatch(/^Wristband, goal, large(, next)?, on the life line$/);
    expect(nameOf('far')).toMatch(/^Far, marker, large(, next)?, on the life line$/);
    // A goal off the life line says nothing of it.
    expect(nameOf('g2')).toMatch(/^Goal two, goal, large(, next)?$/);
  });

  describe('the editor on a goal off the life line', () => {
    test('shows a hollow Join Life chip that puts the goal on the life line where it stands, in one undo step', () => {
      vi.useFakeTimers();
      const store = createStore(joinScene());
      render(<App store={store} now={() => LIFE_NOW} />);
      const before = store.getState();
      openEditorOn(/^Goal two/);
      const chip = screen.getByRole('button', { name: 'Join Life' });
      expect(chip).toHaveClass('line-chip', 'join');
      act(() => chip.click());
      expect(lifeOf(store).stops).toEqual(['start', 'g2', 'wristband', 'far']);
      expect(stopNamed(store, 'g2')).toMatchObject({ x: 900, y: -800 });
      expect(store.getState().tracks.find((t) => t.id === 't2')!.stops).toEqual(['s2', 'g2']);
      // On the line now, the same place offers the way off.
      expect(screen.queryByRole('button', { name: 'Join Life' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Leave Life' })).not.toHaveClass('join');
      act(() => store.undo());
      expect(store.getState()).toEqual(before);
    });

    test('offers no Join Life chip on a goal left of the life train, nor on a step or a square already on it', () => {
      vi.useFakeTimers();
      const behind = joinScene();
      behind.stops.find((s) => s.id === 'g2')!.x = -100;
      render(<App store={createStore(behind)} now={() => LIFE_NOW} />);
      openEditorOn(/^Goal two/);
      expect(screen.queryByRole('button', { name: 'Join Life' })).not.toBeInTheDocument();
      for (const name of [/^Step two/, /^Wristband/, /^Far/]) {
        cleanup();
        render(<App store={createStore(joinScene())} now={() => LIFE_NOW} />);
        openEditorOn(name);
        expect(screen.queryByRole('button', { name: 'Join Life' })).not.toBeInTheDocument();
      }
    });

    test('a hollow chip is a ring in the plate colour with no fill, so on and off differ by more than colour', () => {
      expect(cssRule('.line-chip.join::before')).toMatch(/background:\s*none/);
      expect(cssRule('.line-chip.join::before')).toMatch(/box-shadow:\s*inset 0 0 0 2px var\(--on-plate\)/);
    });
  });
});

test('from the 3-month unit up no project train is drawn, only the life train', () => {
  render(<App store={createStore(withLife())} now={() => WAITING} />);
  for (let i = 0; i < 40 && document.querySelector('.legend')!.textContent !== '5 years'; i++) {
    act(() => {
      fireEvent.wheel(paper(), { clientX: 500, clientY: 400, deltaY: 2500 });
    });
  }
  expect(document.querySelector('.legend')!.textContent).toBe('5 years');
  expect(document.querySelectorAll('[data-train]')).toHaveLength(1);
});

/** Wheels out over the plane until the legend reads `label`. */
function zoomOutTo(label: string) {
  for (let i = 0; i < 400 && document.querySelector('.legend')!.textContent !== label; i++) {
    act(() => {
      fireEvent.wheel(paper(), { clientX: 500, clientY: 400, deltaY: 100 });
    });
  }
  expect(document.querySelector('.legend')!.textContent).toBe(label);
}

describe('zoomed out, a ring speaks for its project', () => {
  /** Start done and the life train heading for Wristband, t1's goal: the life line's next square is the ring. */
  function lifeHeadingForRing() {
    const world = withLife();
    world.stops.find((s) => s.id === 'start')!.done = true;
    world.tracks.find((t) => t.life)!.train = { leg: 1, departedAt: 0 };
    return world;
  }

  test("a tap on a ring its project is not yet heading for does nothing and plays nothing", () => {
    const oscillators = fakeAudio();
    const store = createStore(lifeHeadingForRing());
    render(<App store={store} now={() => 100_000} />);
    zoomOutTo('3 months');
    const before = store.getState();
    act(() => tapOn(screen.getByRole('button', { name: /^Wristband/ })));
    expect(store.getState()).toBe(before);
    expect(oscillators).not.toHaveBeenCalled();
  });

  test("a tap on a ring its project's train is heading for completes it for the project, with the goal's sound", () => {
    const oscillators = fakeAudio();
    const world = lifeHeadingForRing();
    world.stops.find((s) => s.id === 'dentist')!.done = true;
    world.tracks.find((t) => t.id === 't1')!.train = { leg: 1, departedAt: 0 };
    const store = createStore(world);
    render(<App store={store} now={() => 100_000} />);
    zoomOutTo('3 months');
    act(() => tapOn(screen.getByRole('button', { name: /^Wristband/ })));
    expect(stopNamed(store, 'wristband').done).toBe(true);
    expect(oscillators).toHaveBeenCalled();
  });
});

describe('zoomed out, a hidden project line takes nothing', () => {
  const centreOf = (id: string) => {
    const el = document.querySelector<HTMLElement>(`.stop[data-id="${id}"]`)!;
    return { x: parseFloat(el.style.left), y: parseFloat(el.style.top) };
  };

  /**
   * t1 runs for over a year: Dentist 4e7 s out, its goal Wristband, a ring, 5e7 s out. Start, a
   * marker 2e7 s out, sits 800 s above t1's first leg, under a pixel at the 3-month unit and
   * further than the snap reaches (about 1e7 s there) from t1's start and stops.
   */
  function yearsLong() {
    const world = withLife();
    const place = (id: string, x: number) => {
      world.stops.find((s) => s.id === id)!.x = x;
    };
    place('start', 2e7);
    place('dentist', 4e7);
    place('wristband', 5e7);
    place('far', 9e8);
    return world;
  }

  test('a Step carried over a years-long project line, undrawn at 3 months, does not snap to it and adds nothing', () => {
    const store = createStore(yearsLong());
    render(<App store={store} now={() => 1000} />);
    zoomOutTo('3 months');
    openTray();
    const before = store.getState();
    const to = centreOf('start');
    const tile = screen.getByRole('button', { name: 'Step' });
    act(() => {
      fireEvent.pointerDown(tile, { pointerId: 1, clientX: 900, clientY: 740 });
      fireEvent.pointerMove(tile, { pointerId: 1, clientX: to.x, clientY: to.y });
    });
    expect(document.querySelector('.ghost')).not.toHaveClass('snapped');
    act(() => {
      fireEvent.pointerUp(tile, { pointerId: 1, clientX: to.x, clientY: to.y });
    });
    expect(store.getState()).toBe(before);
  });

  test('a step split off a ring at 3 months lands on no project line, since none is drawn', () => {
    const store = createStore(yearsLong());
    render(<App store={store} now={() => 1000} />);
    zoomOutTo('3 months');
    const before = store.getState();
    act(() => splitFrom(/^Wristband/, centreOf('start')));
    expect(store.getState()).toBe(before);
  });

  test("a day's stop dragged at 3 months joins no years-long project line it is released on", () => {
    const NOW = new Date(2026, 10, 1, 9).getTime();
    // Today's day line runs through Dentist, which t1 lists too. t2 is a sketch, its one goal 4e8 s
    // out, its first leg passing 2000 s under Dentist: under a pixel at this zoom, and not drawn.
    const world: World = {
      tracks: [
        { id: 't1', color: 0, origin: { x: 0, y: 0 }, stops: ['dentist', 'wristband'], train: { leg: 0, departedAt: NOW }, target: 'goal' },
        { id: 't2', color: 1, origin: { x: 0, y: 2000 }, stops: ['g2'], train: { leg: 0, departedAt: NOW }, target: 'goal' },
        {
          id: 'day',
          color: 2,
          origin: { x: 1000, y: -400 },
          stops: ['dentist', 'dayEnd'],
          train: { leg: 0, departedAt: NOW },
          target: 'next',
          day: { date: dayOf(NOW), budgets: [1000, 0], lengths: [3600, 1800] },
        },
      ],
      stops: [
        { id: 'dentist', title: 'Dentist', shape: 'circle', size: 'medium', x: 1000, y: 0, done: false },
        { id: 'wristband', title: 'Wristband', shape: 'square', size: 'large', x: 3000, y: 0, done: false },
        { id: 'g2', title: 'Goal two', shape: 'square', size: 'large', x: 4e8, y: 2000, done: false },
        { id: 'dayEnd', title: '', shape: 'square', size: 'small', x: 1500, y: 900, done: false },
      ],
      lastTouched: null,
    };
    const store = createStore(world);
    render(<App store={store} now={() => NOW} />);
    zoomOutTo('3 months');
    // Past the tap's slop, along the day line's height.
    act(() => dragStop(/^Dentist/, 12, 0));
    expect(store.getState().stops.find((s) => s.id === 'dentist')!.x).toBeGreaterThan(1000);
    expect(store.getState().tracks.find((t) => t.id === 't2')!.stops).toEqual(['g2']);
  });
});

describe('Shift held on an end of a line keeps its time', () => {
  const LIFE_NOW = 1000;
  /** Screen pixels per world second at the opening, as in the life line gestures. */
  const SCALE = 1 / 3;
  const SLANT = Math.SQRT2 - 1;
  /** Goal two's square, not the edge bubble that names it too. */
  const GOAL_TWO = /^Goal two, goal,/;

  /**
   * withLife with its squares brought in, and a second line t2 whose goal Goal two is not on the
   * life line: a step at (800, -400) and the goal 900 s on at (1700, -400).
   */
  function scene(): World {
    const world = withLife();
    const place = (id: string, x: number) => {
      world.stops.find((s) => s.id === id)!.x = x;
    };
    place('start', 600);
    place('wristband', 1100);
    place('far', 1400);
    world.tracks.push({ id: 't2', color: 1, origin: { x: 0, y: -400 }, stops: ['s2', 'g2'], train: { leg: 0, departedAt: 0 }, target: 'goal' });
    world.stops.push(
      { id: 's2', title: 'Step two', shape: 'circle', size: 'medium', x: 800, y: -400, done: false },
      { id: 'g2', title: 'Goal two', shape: 'square', size: 'large', x: 1700, y: -400, done: false },
    );
    return world;
  }

  type Store = ReturnType<typeof createStore>;
  const track = (store: Store, id: string) => store.getState().tracks.find((t) => t.id === id)!;
  const byId = (store: Store) => new Map(store.getState().stops.map((s) => [s.id, s]));
  const legOf = (store: Store, trackId: string, leg: number) => legSeconds(trackRoute(track(store, trackId), byId(store)), leg);
  const timeToGoal2 = (store: Store) => timeLeft(track(store, 't2'), 'g2', byId(store), LIFE_NOW);

  /** Presses on a stop 4 px off its centre and moves by (dx, dy), Shift held or not; the returned function lets go. */
  function hold(name: RegExp, dx: number, dy: number, shiftKey: boolean) {
    const el = screen.getByRole('button', { name });
    const x = parseFloat(el.style.left) + 4;
    const y = parseFloat(el.style.top);
    fireEvent.pointerDown(el, { pointerId: 1, clientX: x, clientY: y, shiftKey });
    fireEvent.pointerMove(el, { pointerId: 1, clientX: x + dx, clientY: y + dy, shiftKey });
    return () => fireEvent.pointerUp(el, { pointerId: 1, clientX: x + dx, clientY: y + dy, shiftKey });
  }

  test("a goal goes to the finger's height and slides along it, so its leg and its time stay as they were", () => {
    const store = createStore(scene());
    render(<App store={store} now={() => LIFE_NOW} />);
    const time = timeToGoal2(store);
    const step = stopNamed(store, 's2');
    let release = () => {};
    act(() => {
      release = hold(GOAL_TWO, 60, 90, true);
    });
    const goal = stopNamed(store, 'g2');
    expect(goal.y).toBeCloseTo(-400 + 90 / SCALE, 6);
    expect(goal.x).toBeCloseTo(800 + 900 - SLANT * (90 / SCALE), 6);
    expect(legOf(store, 't2', 1)).toBeCloseTo(900, 6);
    expect(document.querySelector('.leg-time')!.textContent).toBe(formatSeconds(900));
    // The step ahead of the train is not stretched.
    expect(stopNamed(store, 's2')).toEqual(step);
    act(() => release());
    expect(timeToGoal2(store)).toBeCloseTo(time, 6);
    expect(track(store, 'life').stops).toEqual(['start', 'wristband', 'far']);
  });

  test("let go near the life line, a goal joins it at the life line's height with the same time, in one undo step", () => {
    const store = createStore(scene());
    render(<App store={store} now={() => LIFE_NOW} />);
    const time = timeToGoal2(store);
    const step = stopNamed(store, 's2');
    const before = store.getState();
    const lineY = at(/^Start/).y;
    const goal = at(GOAL_TWO);
    let release = () => {};
    // 10 px short of the line is in snap reach, so it sits on the line, 400 s above where it was.
    act(() => {
      release = hold(GOAL_TWO, 0, lineY - goal.y + 10, true);
    });
    const x = 1700 - SLANT * 400;
    expect(stopNamed(store, 'g2')).toMatchObject({ y: -800 });
    expect(stopNamed(store, 'g2').x).toBeCloseTo(x, 6);
    // The landing preview is where it is.
    const landing = document.querySelector<HTMLElement>('.ghost.snapped')!;
    expect(parseFloat(landing.style.left)).toBeCloseTo(at(/^Start/).x + (x - 600) * SCALE, 6);
    expect(parseFloat(landing.style.top)).toBeCloseTo(lineY, 6);
    act(() => release());
    expect(track(store, 'life').stops).toEqual(['start', 'wristband', 'far', 'g2']);
    expect(stopNamed(store, 'g2').x).toBeCloseTo(x, 6);
    expect(stopNamed(store, 's2')).toEqual(step);
    expect(legOf(store, 't2', 1)).toBeCloseTo(900, 6);
    expect(timeToGoal2(store)).toBeCloseTo(time, 6);
    act(() => store.undo());
    expect(store.getState()).toEqual(before);
  });

  test('Shift pressed mid-drag takes hold at once, and let go the drag stretches again', () => {
    const store = createStore(scene());
    render(<App store={store} now={() => LIFE_NOW} />);
    let release = () => {};
    act(() => {
      release = hold(GOAL_TWO, 60, 90, false);
    });
    const free = stopNamed(store, 'g2');
    expect(free.x).toBeCloseTo(1700 + 60 / SCALE, 6);
    expect(stopNamed(store, 's2').x).not.toBe(800);
    act(() => {
      fireEvent.keyDown(window, { key: 'Shift', shiftKey: true });
    });
    expect(stopNamed(store, 'g2').x).toBeCloseTo(1700 - SLANT * (90 / SCALE), 6);
    expect(stopNamed(store, 's2')).toMatchObject({ x: 800, y: -400 });
    act(() => {
      fireEvent.keyUp(window, { key: 'Shift', shiftKey: false });
    });
    expect(stopNamed(store, 'g2')).toEqual(free);
    act(() => release());
  });

  test('a ring on the life line held with Shift stays where its time puts it', () => {
    const store = createStore(scene());
    render(<App store={store} now={() => LIFE_NOW} />);
    act(() => hold(/^Wristband/, 30, 15, true)());
    expect(stopNamed(store, 'wristband')).toMatchObject({ y: -800 });
    expect(stopNamed(store, 'wristband').x).toBeCloseTo(1100, 6);
  });

  test('the start of a line keeps its first leg as long as it was', () => {
    const store = createStore(running());
    render(<App store={store} now={() => 500_000} />);
    const length = legOf(store, 't1', 0);
    const hit = document.querySelector<SVGRectElement>('[data-target="origin"]')!;
    const m = /translate\(([-\d.e]+)px, ([-\d.e]+)px\)/.exec(hit.style.transform)!;
    const x = parseFloat(m[1]) + 4;
    const y = parseFloat(m[2]);
    const scale = (left(/^Dentist/) - parseFloat(m[1])) / 1000;
    act(() => {
      fireEvent.pointerDown(hit, { pointerId: 1, clientX: x, clientY: y, shiftKey: true });
      fireEvent.pointerMove(hit, { pointerId: 1, clientX: x - 50, clientY: y + 30, shiftKey: true });
      fireEvent.pointerUp(hit, { pointerId: 1, clientX: x - 50, clientY: y + 30, shiftKey: true });
    });
    const origin = track(store, 't1').origin;
    expect(origin.y).toBeCloseTo(30 / scale, 6);
    expect(origin.x).toBeCloseTo(1000 - (length - SLANT * (30 / scale)), 6);
    expect(legOf(store, 't1', 0)).toBeCloseTo(length, 6);
  });
});

import { act, fireEvent, render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { EMPTY } from '../model/reducer';
import { createStore } from '../store/store';
import { App } from './App';

const dentist = { id: 'a', title: 'Dentist', shape: 'circle' as const, x: 100, y: 100, z: 0 as const, done: false };
const taxes = { id: 'b', title: 'Taxes', shape: 'square' as const, x: 300, y: 100, z: 0 as const, done: false };

test('the plane shows stations as shapes with labels and four HUD corners', () => {
  const store = createStore({ ...EMPTY, stations: [dentist] });
  render(<App store={store} />);
  expect(screen.getByRole('button', { name: 'Dentist, small' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Deep line. Starts a new stretch.' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Out line. Starts a new stretch.' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Add a station' })).toBeInTheDocument();
  expect(screen.getByRole('main', { name: 'The plane' })).toBeInTheDocument();
});

test('the world layer carries the camera transform', () => {
  const store = createStore(EMPTY);
  render(<App store={store} />);
  expect(screen.getByTestId('world').style.transform).toBe('translate(0px, 0px) scale(1)');
});

test('a done station is named done and the clock has no digits', () => {
  const store = createStore({
    stations: [{ ...dentist, done: true }],
    stretch: { kind: 'deep', length: 'couple', name: 'Afternoon', startedAt: 0, line: ['a'] },
    lastLength: 'couple',
  });
  render(<App store={store} now={() => 30 * 60_000} />);
  expect(screen.getByRole('button', { name: 'Dentist, small, done' })).toBeInTheDocument();
  const clock = screen.getByRole('button', { name: /Stretch clock/ });
  expect(clock.textContent).toBe('');
  expect(screen.getByRole('heading', { name: /^Afternoon/ })).toBeInTheDocument();
  expect(screen.getByText('Deep, a couple of hours')).toBeInTheDocument();
});

test('dragging a station moves it in world units, keeping the grip', () => {
  const store = createStore({ ...EMPTY, stations: [dentist] });
  render(<App store={store} />);
  const button = screen.getByRole('button', { name: 'Dentist, small' });
  fireEvent.pointerDown(button, { pointerId: 1, clientX: 104, clientY: 103 });
  fireEvent.pointerMove(button, { pointerId: 1, clientX: 154, clientY: 133 });
  fireEvent.pointerUp(button, { pointerId: 1, clientX: 154, clientY: 133 });
  expect(store.getState().stations[0]).toMatchObject({ x: 150, y: 130 });
});

test('a long press on a station opens the editor and a tap on paper closes it', () => {
  vi.useFakeTimers();
  try {
    const store = createStore({ ...EMPTY, stations: [dentist] });
    render(<App store={store} />);
    const button = screen.getByRole('button', { name: 'Dentist, small' });
    fireEvent.pointerDown(button, { pointerId: 1, clientX: 100, clientY: 100 });
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(screen.getByRole('textbox', { name: 'Station title' })).toHaveValue('Dentist');
    fireEvent.pointerUp(button, { pointerId: 1, clientX: 100, clientY: 100 });
    expect(screen.getByRole('textbox', { name: 'Station title' })).toBeInTheDocument();

    const paper = screen.getByRole('main', { name: 'The plane' });
    fireEvent.pointerDown(paper, { pointerId: 2, clientX: 400, clientY: 400 });
    fireEvent.pointerUp(paper, { pointerId: 2, clientX: 400, clientY: 400 });
    expect(screen.queryByRole('textbox', { name: 'Station title' })).not.toBeInTheDocument();
  } finally {
    vi.useRealTimers();
  }
});

test('a drag from a bullet through two stations starts a stretch, and the color runs out', () => {
  const store = createStore({ ...EMPTY, stations: [dentist, taxes] });
  render(<App store={store} now={() => new Date(2026, 9, 29, 15, 0).getTime()} />);
  const bullet = screen.getByRole('button', { name: 'Deep line. Starts a new stretch.' });
  const paper = screen.getByRole('main', { name: 'The plane' });

  fireEvent.pointerDown(bullet, { pointerId: 1, clientX: 40, clientY: 700 });
  fireEvent.pointerMove(paper, { pointerId: 1, clientX: 100, clientY: 100 });
  expect(document.querySelector('polyline')!.getAttribute('points')).toBe('60,100 100,100 100,100');
  fireEvent.pointerMove(paper, { pointerId: 1, clientX: 300, clientY: 100 });
  fireEvent.pointerUp(paper, { pointerId: 1, clientX: 320, clientY: 100 });

  const stretch = store.getState().stretch!;
  expect(stretch).toMatchObject({ kind: 'deep', length: 'couple', name: 'Afternoon', line: ['a', 'b'] });
  expect(screen.getByRole('button', { name: 'Dentist, small, next' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Taxes, large' })).toBeInTheDocument();
  expect(document.querySelector('polyline')!.getAttribute('points')).toBe('60,100 100,100 132,100');
  expect(document.querySelector('[data-terminus]')).toBeInTheDocument();
});

test('a drag from a bullet over nothing starts no stretch', () => {
  const store = createStore({ ...EMPTY, stations: [dentist] });
  render(<App store={store} />);
  const bullet = screen.getByRole('button', { name: 'Body line. Starts a new stretch.' });
  const paper = screen.getByRole('main', { name: 'The plane' });
  fireEvent.pointerDown(bullet, { pointerId: 1, clientX: 40, clientY: 700 });
  fireEvent.pointerMove(paper, { pointerId: 1, clientX: 400, clientY: 400 });
  fireEvent.pointerUp(paper, { pointerId: 1, clientX: 400, clientY: 400 });
  expect(store.getState().stretch).toBeNull();
  expect(document.querySelector('polyline')).not.toBeInTheDocument();
});

const running = (line: string[], length: 'hour' | 'couple' = 'couple') => ({
  stations: [dentist, { ...taxes, title: 'Call mum', shape: 'circle' as const, x: 200 }],
  stretch: { kind: 'deep' as const, length, name: 'Afternoon', startedAt: 0, line },
  lastLength: length,
});

const press = (el: Element, x: number, y: number, pointerId = 1) => {
  fireEvent.pointerDown(el, { pointerId, clientX: x, clientY: y });
  fireEvent.pointerUp(el, { pointerId, clientX: x, clientY: y });
};

test('tapping a station on the line completes it, the train moves on, and a tap on the dot restores it', () => {
  const store = createStore(running(['a', 'b']));
  render(<App store={store} now={() => 60_000} />);
  expect(document.querySelector('[data-train]')).toHaveAttribute('data-next', '0');

  press(screen.getByRole('button', { name: 'Dentist, small, next' }), 100, 100);
  expect(store.getState().stations[0].done).toBe(true);
  expect(document.querySelector('[data-train]')).toHaveAttribute('data-next', '1');
  expect(screen.getByRole('button', { name: 'Call mum, small, next' })).toBeInTheDocument();

  press(screen.getByRole('button', { name: 'Dentist, small, done' }), 100, 100);
  expect(store.getState().stations[0].done).toBe(false);
  expect(document.querySelector('[data-train]')).toHaveAttribute('data-next', '0');
});

test('a station off the line does not complete on a tap', () => {
  const store = createStore(running(['b']));
  render(<App store={store} now={() => 60_000} />);
  press(screen.getByRole('button', { name: 'Dentist, small' }), 100, 100);
  expect(store.getState().stations[0].done).toBe(false);
});

test('the stretch ends by itself when the clock runs out, and the pending stations slide to the front', () => {
  vi.useFakeTimers();
  try {
    let t = 0;
    const store = createStore(running(['a', 'b'], 'hour'));
    render(<App store={store} now={() => t} />);
    t = 61 * 60_000;
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(store.getState().stretch).toBeNull();
    const [a, b] = store.getState().stations;
    expect(a.x).toBe(-128);
    expect(b.x).toBe(-64);
  } finally {
    vi.useRealTimers();
  }
});

test('holding the clock ends the stretch, a quick tap does not', () => {
  vi.useFakeTimers();
  try {
    const store = createStore(running(['a']));
    render(<App store={store} now={() => 60_000} />);
    const clock = screen.getByRole('button', { name: /Stretch clock/ });
    press(clock, 900, 30);
    expect(store.getState().stretch).not.toBeNull();

    fireEvent.pointerDown(clock, { pointerId: 2, clientX: 900, clientY: 30 });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(clock).toHaveClass('holding');
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(store.getState().stretch).toBeNull();
  } finally {
    vi.useRealTimers();
  }
});

test('tapping the clock flies the camera to the train at the stretch zoom', () => {
  const store = createStore(running(['a', 'b']));
  render(<App store={store} now={() => 60_000} />);
  press(screen.getByRole('button', { name: /Stretch clock/ }), 900, 30);
  expect(screen.getByTestId('world').style.transform).toMatch(/scale\(1.6\)$/);
});

test('a tapped bullet shows the chips, and the chosen length is the one the drawn stretch gets', () => {
  const store = createStore({ ...EMPTY, stations: [dentist, taxes] });
  render(<App store={store} now={() => new Date(2026, 9, 29, 9, 0).getTime()} />);
  const bullet = screen.getByRole('button', { name: 'Out line. Starts a new stretch.' });
  const paper = screen.getByRole('main', { name: 'The plane' });

  expect(screen.queryByRole('button', { name: 'half a day' })).not.toBeInTheDocument();
  fireEvent.click(bullet);
  expect(screen.getByRole('button', { name: 'a couple of hours' })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'half a day' }));
  expect(screen.getByRole('button', { name: 'half a day' })).toHaveAttribute('aria-pressed', 'true');

  fireEvent.pointerDown(bullet, { pointerId: 1, clientX: 40, clientY: 700 });
  fireEvent.pointerMove(paper, { pointerId: 1, clientX: 100, clientY: 100 });
  fireEvent.pointerMove(paper, { pointerId: 1, clientX: 300, clientY: 100 });
  fireEvent.pointerUp(paper, { pointerId: 1, clientX: 320, clientY: 100 });

  expect(store.getState().stretch).toMatchObject({ kind: 'out', length: 'half', name: 'Morning', line: ['a', 'b'] });
  expect(store.getState().lastLength).toBe('half');
  expect(screen.queryByRole('button', { name: 'half a day' })).not.toBeInTheDocument();
  expect(screen.getByText('Out, half a day')).toBeInTheDocument();
  // 192 minutes of capacity: the circle and the square both fit now.
  expect(document.querySelector('polyline')!.getAttribute('points')).toBe('60,100 100,100 300,100 332,100');
});

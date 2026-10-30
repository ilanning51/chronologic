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
  expect(screen.getByRole('heading', { name: 'Afternoon' })).toBeInTheDocument();
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

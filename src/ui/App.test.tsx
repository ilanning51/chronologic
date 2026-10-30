import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { EMPTY } from '../model/reducer';
import { createStore } from '../store/store';
import { App } from './App';

const dentist = { id: 'a', title: 'Dentist', shape: 'circle' as const, x: 100, y: 100, z: 0 as const, done: false };

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

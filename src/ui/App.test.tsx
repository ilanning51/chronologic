import uiCss from '../styles/ui.css?raw';
import tokensCss from '../styles/tokens.css?raw';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
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

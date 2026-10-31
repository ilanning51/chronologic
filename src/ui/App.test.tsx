import uiCss from '../styles/ui.css?raw';
import tokensCss from '../styles/tokens.css?raw';
import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
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

test('a seeded world draws its stops as shapes with labels and the train on the path', () => {
  render(<App store={createStore(running())} now={() => 500_000} />);
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

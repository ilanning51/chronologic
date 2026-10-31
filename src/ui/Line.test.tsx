import { render } from '@testing-library/react';
import { expect, test } from 'vitest';
import { Line } from './Line';

const two = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
];

test('the line is drawn in the kind color and ends in a terminus', () => {
  const { container } = render(<Line points={two} color="var(--deep)" nextIndex={1} terminus />);
  const polyline = container.querySelector('polyline')!;
  expect(polyline.getAttribute('points')).toBe('-40,0 0,0 100,0 132,0');
  expect(polyline.style.stroke).toBe('var(--deep)');
  expect(container.querySelector('[data-terminus]')).toBeInTheDocument();
  expect(container.querySelector('[data-train]')).toHaveAttribute('data-next', '1');
});

test('while drawing, the line follows the tail and shows no terminus or train', () => {
  const { container } = render(<Line points={two} tail={{ x: 150, y: 50 }} color="var(--out)" nextIndex={null} terminus={false} />);
  expect(container.querySelector('polyline')!.getAttribute('points')).toBe('-40,0 0,0 100,0 150,50');
  expect(container.querySelector('[data-terminus]')).not.toBeInTheDocument();
  expect(container.querySelector('[data-train]')).not.toBeInTheDocument();
});

test('with no points nothing is drawn, and with nothing pending the train is hidden', () => {
  const empty = render(<Line points={[]} color="var(--deep)" nextIndex={null} terminus />);
  expect(empty.container.querySelector('polyline')).not.toBeInTheDocument();
  const done = render(<Line points={two} color="var(--deep)" nextIndex={null} terminus />);
  expect(done.container.querySelector('polyline')).toBeInTheDocument();
  expect(done.container.querySelector('[data-train]')).not.toBeInTheDocument();
});

test('while a station is dragged the line is marked dragging, so the train and terminus do not ease', () => {
  const still = render(<Line points={two} color="var(--deep)" nextIndex={1} terminus />);
  expect(still.container.querySelector('svg')).not.toHaveClass('dragging');
  const moving = render(<Line points={two} color="var(--deep)" nextIndex={1} terminus dragging />);
  expect(moving.container.querySelector('svg')).toHaveClass('dragging');
});

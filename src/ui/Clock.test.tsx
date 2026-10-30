import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { Clock } from './Clock';

test('the pie shows the remaining fraction with no digits', () => {
  render(<Clock fraction={0.64} color="var(--deep)" holding={false} />);
  const button = screen.getByRole('button', { name: 'Stretch clock. Tap to find the train, hold to end the stretch.' });
  expect(button.textContent).toBe('');
  const pie = button.querySelector('.pie') as HTMLElement;
  expect(pie.style.getPropertyValue('--pie')).toBe('conic-gradient(var(--deep) 0 64%, var(--paper) 64% 100%)');
});

test('while held the pie is marked as shrinking', () => {
  const { rerender } = render(<Clock fraction={1} color="var(--out)" holding={false} />);
  const button = screen.getByRole('button', { name: /Stretch clock/ });
  expect(button).not.toHaveClass('holding');
  rerender(<Clock fraction={1} color="var(--out)" holding />);
  expect(button).toHaveClass('holding');
});

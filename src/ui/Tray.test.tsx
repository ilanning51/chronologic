import { fireEvent, render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { Tray } from './Tray';

test('the plus toggles, and the tiles show only when open', () => {
  const onToggle = vi.fn();
  const { rerender } = render(<Tray open={false} onToggle={onToggle} />);
  expect(screen.queryByRole('button', { name: 'Step' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Add' }));
  expect(onToggle).toHaveBeenCalledTimes(1);
  rerender(<Tray open onToggle={onToggle} />);
  for (const [name, tile] of [['Step', 'circle'], ['Sub-goal', 'triangle'], ['New line', 'line']]) {
    const button = screen.getByRole('button', { name });
    expect(button).toHaveAttribute('data-target', 'tile');
    expect(button).toHaveAttribute('data-tile', tile);
  }
  expect(screen.getByRole('button', { name: 'Add' })).toHaveAttribute('data-target', 'hud');
});

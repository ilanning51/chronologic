import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { History } from './History';

const noop = () => {};

test('the tooltips name the shortcut the platform uses', () => {
  const { unmount } = render(<History canUndo canRedo onUndo={noop} onRedo={noop} mac />);
  expect(screen.getByRole('button', { name: 'Undo' })).toHaveAttribute('title', 'Undo (⌘Z)');
  expect(screen.getByRole('button', { name: 'Redo' })).toHaveAttribute('title', 'Redo (⇧⌘Z)');
  unmount();
  render(<History canUndo canRedo onUndo={noop} onRedo={noop} mac={false} />);
  expect(screen.getByRole('button', { name: 'Undo' })).toHaveAttribute('title', 'Undo (Ctrl+Z)');
  expect(screen.getByRole('button', { name: 'Redo' })).toHaveAttribute('title', 'Redo (Ctrl+Shift+Z)');
});

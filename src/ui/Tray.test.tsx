import { fireEvent, render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { Tray } from './Tray';

const noop = () => {};

test('the plus toggles, and the tiles show only when open', () => {
  const onToggle = vi.fn();
  const { rerender } = render(<Tray open={false} brush={null} onToggle={onToggle} onBrushKey={noop} />);
  expect(screen.queryByRole('button', { name: 'Step' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Add' }));
  expect(onToggle).toHaveBeenCalledTimes(1);
  rerender(<Tray open brush={null} onToggle={onToggle} onBrushKey={noop} />);
  for (const [name, tile] of [['Step', 'circle'], ['Sub-goal', 'triangle'], ['Marker', 'square'], ['New line', 'line'], ['Today', 'sun']]) {
    const button = screen.getByRole('button', { name });
    expect(button).toHaveAttribute('data-target', 'tile');
    expect(button).toHaveAttribute('data-tile', tile);
  }
  expect(screen.getByRole('button', { name: 'Add' })).toHaveAttribute('data-target', 'hud');
  // The Marker tile follows Sub-goal.
  expect(screen.getAllByRole('button').map((b) => b.getAttribute('aria-label')).slice(0, 4)).toEqual(['Step', 'Sub-goal', 'Marker', 'New line']);
});

test('the lit tile is pressed and the others are not', () => {
  render(<Tray open brush="line" onToggle={noop} onBrushKey={noop} />);
  expect(screen.getByRole('button', { name: 'New line' })).toHaveAttribute('aria-pressed', 'true');
  for (const name of ['Step', 'Sub-goal', 'Marker', 'Today']) {
    expect(screen.getByRole('button', { name })).toHaveAttribute('aria-pressed', 'false');
  }
});

test('a keyboard click on a tile asks for its brush', () => {
  const onBrushKey = vi.fn();
  render(<Tray open brush={null} onToggle={noop} onBrushKey={onBrushKey} />);
  fireEvent.click(screen.getByRole('button', { name: 'Sub-goal' }), { detail: 0 });
  expect(onBrushKey).toHaveBeenCalledTimes(1);
  expect(onBrushKey).toHaveBeenCalledWith('triangle');
});

test('a pointer tap on a tile toggles once', () => {
  // The plane's recognizer reports the pointer tap; the click that follows it must not toggle again.
  const onBrushKey = vi.fn();
  render(<Tray open brush={null} onToggle={noop} onBrushKey={onBrushKey} />);
  fireEvent.click(screen.getByRole('button', { name: 'Sub-goal' }), { detail: 1 });
  expect(onBrushKey).not.toHaveBeenCalled();
});

test('the Marker tile is a brush like the others, lit when its brush is on', () => {
  const onBrushKey = vi.fn();
  const { rerender } = render(<Tray open brush={null} onToggle={noop} onBrushKey={onBrushKey} />);
  fireEvent.click(screen.getByRole('button', { name: 'Marker' }), { detail: 0 });
  expect(onBrushKey).toHaveBeenCalledWith('square');
  rerender(<Tray open brush="square" onToggle={noop} onBrushKey={onBrushKey} />);
  expect(screen.getByRole('button', { name: 'Marker' })).toHaveAttribute('aria-pressed', 'true');
});

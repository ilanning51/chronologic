import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import type { Station } from '../model/types';
import { StationEditor } from './StationEditor';

const square: Station = { id: 'q', title: 'Taxes', shape: 'square', x: 0, y: 0, z: 0, done: false };
const circle: Station = { ...square, id: 'c', shape: 'circle' };

function renderEditor(station: Station) {
  const handlers = { onEdit: vi.fn(), onSplit: vi.fn(), onDelete: vi.fn(), onClose: vi.fn() };
  render(<StationEditor station={station} {...handlers} />);
  return handlers;
}

test('the editor renames and resizes', async () => {
  const user = userEvent.setup();
  const { onEdit } = renderEditor(square);

  const input = screen.getByRole('textbox', { name: 'Station title' });
  expect(input).toHaveValue('Taxes');
  await user.type(input, ' 2025');
  expect(onEdit).toHaveBeenLastCalledWith({ title: 'Taxes 2025' });

  expect(screen.getByRole('button', { name: 'Large' })).toHaveAttribute('aria-pressed', 'true');
  await user.click(screen.getByRole('button', { name: 'Small' }));
  expect(onEdit).toHaveBeenLastCalledWith({ shape: 'circle' });
});

test('split is offered for a square and a triangle, not a circle', () => {
  const { onSplit } = renderEditor(square);
  expect(screen.getByRole('button', { name: 'Split into 4 circles' })).toBeInTheDocument();
  screen.getByRole('button', { name: 'Split into 4 circles' }).click();
  expect(onSplit).toHaveBeenCalledTimes(1);
});

test('a circle cannot be split', () => {
  renderEditor(circle);
  expect(screen.queryByRole('button', { name: /Split/ })).not.toBeInTheDocument();
});

test('delete asks for a second tap', async () => {
  const user = userEvent.setup();
  const { onDelete } = renderEditor(square);

  await user.click(screen.getByRole('button', { name: 'Delete' }));
  expect(onDelete).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Delete, tap again' }));
  expect(onDelete).toHaveBeenCalledTimes(1);
});

test('Escape and Return close the editor', async () => {
  const user = userEvent.setup();
  const { onClose } = renderEditor(square);
  await user.type(screen.getByRole('textbox', { name: 'Station title' }), '{Escape}');
  expect(onClose).toHaveBeenCalledTimes(1);
  await user.type(screen.getByRole('textbox', { name: 'Station title' }), '{Enter}');
  expect(onClose).toHaveBeenCalledTimes(2);
});

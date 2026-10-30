import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { CaptureField } from './CaptureField';

test('capture adds a station from a title and a shape', async () => {
  const user = userEvent.setup();
  const onAdd = vi.fn();
  render(<CaptureField onAdd={onAdd} />);

  await user.click(screen.getByRole('button', { name: 'Add a station' }));
  const input = screen.getByRole('textbox', { name: 'Station title' });
  expect(input).toHaveFocus();
  await user.type(input, 'Fix the printer');
  await user.click(screen.getByRole('button', { name: 'Add as a medium station' }));

  expect(onAdd).toHaveBeenCalledWith('Fix the printer', 'triangle');
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Add a station' })).toBeInTheDocument();
});

test('an empty title adds nothing and Return adds a circle', async () => {
  const user = userEvent.setup();
  const onAdd = vi.fn();
  render(<CaptureField onAdd={onAdd} />);

  await user.click(screen.getByRole('button', { name: 'Add a station' }));
  await user.click(screen.getByRole('button', { name: 'Add as a medium station' }));
  expect(onAdd).not.toHaveBeenCalled();
  expect(screen.getByRole('textbox', { name: 'Station title' })).toBeInTheDocument();

  await user.type(screen.getByRole('textbox', { name: 'Station title' }), '  Call Dana  {Enter}');
  expect(onAdd).toHaveBeenCalledWith('Call Dana', 'circle');
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
});

test('Escape closes the pill without adding', async () => {
  const user = userEvent.setup();
  const onAdd = vi.fn();
  render(<CaptureField onAdd={onAdd} />);

  await user.click(screen.getByRole('button', { name: 'Add a station' }));
  await user.type(screen.getByRole('textbox', { name: 'Station title' }), 'half a thought{Escape}');
  expect(onAdd).not.toHaveBeenCalled();
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
});

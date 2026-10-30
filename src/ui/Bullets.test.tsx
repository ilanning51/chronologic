import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { Bullets } from './Bullets';

test('tapping a bullet shows the chips and picking one marks it', async () => {
  const user = userEvent.setup();
  const onPickKind = vi.fn();
  const onPickLength = vi.fn();
  const { rerender } = render(<Bullets pendingKind={null} length="couple" onPickKind={onPickKind} onPickLength={onPickLength} />);
  expect(screen.queryByRole('button', { name: 'half a day' })).not.toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Deep line. Starts a new stretch.' }));
  expect(onPickKind).toHaveBeenCalledWith('deep');

  rerender(<Bullets pendingKind="deep" length="couple" onPickKind={onPickKind} onPickLength={onPickLength} />);
  expect(screen.getByRole('button', { name: 'an hour' })).toHaveAttribute('aria-pressed', 'false');
  expect(screen.getByRole('button', { name: 'a couple of hours' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: 'half a day' })).toHaveAttribute('aria-pressed', 'false');
  expect(screen.getByRole('button', { name: 'the whole day' })).toHaveAttribute('aria-pressed', 'false');

  await user.click(screen.getByRole('button', { name: 'half a day' }));
  expect(onPickLength).toHaveBeenCalledWith('half');
});

test('the pending bullet is marked and the others are not', () => {
  render(<Bullets pendingKind="body" length="hour" onPickKind={vi.fn()} onPickLength={vi.fn()} />);
  expect(screen.getByRole('button', { name: 'Body line. Starts a new stretch.' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: 'Deep line. Starts a new stretch.' })).toHaveAttribute('aria-pressed', 'false');
  expect(screen.getByRole('button', { name: 'an hour' })).toHaveAttribute('aria-pressed', 'true');
});

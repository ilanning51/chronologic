import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import type { Stretch } from '../model/types';
import { NameBlock } from './NameBlock';

const afternoon: Stretch = { kind: 'deep', length: 'couple', name: 'Afternoon', startedAt: 0, line: [] };

test('the name block names the kind and length in words and renames on tap', async () => {
  const user = userEvent.setup();
  const onRename = vi.fn();
  render(<NameBlock stretch={afternoon} onRename={onRename} />);
  expect(screen.getByRole('heading', { name: /^Afternoon/ })).toBeInTheDocument();
  expect(screen.getByText('Deep, a couple of hours')).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Afternoon. Tap to rename.' }));
  const input = screen.getByRole('textbox', { name: 'Stretch name' });
  expect(input).toHaveValue('Afternoon');
  expect(input).toHaveFocus();
  await user.clear(input);
  await user.type(input, 'Writing{Enter}');
  expect(onRename).toHaveBeenCalledWith('Writing');
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { name: /^Afternoon/ })).toBeInTheDocument();
});

test('a blank name is not committed, and leaving the field commits', async () => {
  const user = userEvent.setup();
  const onRename = vi.fn();
  render(<NameBlock stretch={afternoon} onRename={onRename} />);

  await user.click(screen.getByRole('button', { name: 'Afternoon. Tap to rename.' }));
  await user.clear(screen.getByRole('textbox', { name: 'Stretch name' }));
  await user.keyboard('{Enter}');
  expect(onRename).not.toHaveBeenCalled();
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Afternoon. Tap to rename.' }));
  await user.type(screen.getByRole('textbox', { name: 'Stretch name' }), ' of writing');
  await user.tab();
  expect(onRename).toHaveBeenCalledWith('Afternoon of writing');
});

test('with no stretch the block is empty', () => {
  const { container } = render(<NameBlock stretch={null} onRename={vi.fn()} />);
  expect(container).toBeEmptyDOMElement();
});

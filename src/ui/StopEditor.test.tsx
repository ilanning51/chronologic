import { fireEvent, render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import type { Stop } from '../model/types';
import { StopEditor } from './StopEditor';

const stop: Stop = { id: 's', title: 'Dentist', shape: 'circle', size: 'medium', x: 0, y: 0, done: true };

function setup(props: { goal: boolean; done: boolean; holding?: boolean }) {
  const handlers = { onEdit: vi.fn(), onDelete: vi.fn(), onUndo: vi.fn(), onClose: vi.fn() };
  render(<StopEditor stop={{ ...stop, done: props.done }} holding={props.holding ?? false} {...props} {...handlers} />);
  return handlers;
}

test('a done dot offers Not done, and no delete unless it is the goal', () => {
  const { onUndo } = setup({ goal: false, done: true });
  expect(screen.getByRole('group', { name: 'Done stop' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Not done' }));
  expect(onUndo).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('button', { name: 'Hold to delete the line' })).not.toBeInTheDocument();
});

test('the goal dot also offers a hold-to-delete button that fills while held', () => {
  setup({ goal: true, done: true, holding: true });
  const hold = screen.getByRole('button', { name: 'Hold to delete the line' });
  expect(hold).toHaveAttribute('data-target', 'hold');
  expect(hold).toHaveAttribute('data-id', 'delete');
  expect(hold).toHaveTextContent('Hold to delete');
  expect(hold).toHaveClass('holding');
});

test('a pending stop edits its title and closes on Return', () => {
  const { onEdit, onClose } = setup({ goal: false, done: false });
  const title = screen.getByRole('textbox', { name: 'Stop title' });
  fireEvent.change(title, { target: { value: 'Dentist, 3pm' } });
  expect(onEdit).toHaveBeenCalledWith({ title: 'Dentist, 3pm' });
  fireEvent.keyDown(title, { key: 'Enter' });
  expect(onClose).toHaveBeenCalledTimes(1);
});

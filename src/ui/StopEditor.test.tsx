import { fireEvent, render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import type { Stop } from '../model/types';
import { StopEditor } from './StopEditor';

const stop: Stop = { id: 's', title: 'Dentist', shape: 'circle', size: 'medium', x: 0, y: 0, done: true };

function setup(props: {
  goal: boolean;
  dayEnd?: boolean;
  done: boolean;
  holding?: boolean;
  lines?: { trackId: string; color: number | null }[];
}) {
  const handlers = { onEdit: vi.fn(), onDelete: vi.fn(), onUndo: vi.fn(), onClose: vi.fn(), onLeave: vi.fn() };
  render(
    <StopEditor
      stop={{ ...stop, done: props.done }}
      holding={props.holding ?? false}
      lines={props.lines ?? []}
      {...props}
      {...handlers}
    />,
  );
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

test('a pending stop offers shapes, sizes and an immediate Delete', () => {
  const { onEdit, onDelete } = setup({ goal: false, done: false });
  expect(screen.getByRole('button', { name: 'Step' })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'Sub-goal' }));
  expect(onEdit).toHaveBeenCalledWith({ shape: 'triangle' });
  expect(screen.getByRole('button', { name: 'Medium' })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'Large' }));
  expect(onEdit).toHaveBeenCalledWith({ size: 'large' });
  fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
  expect(onDelete).toHaveBeenCalledTimes(1);
});

test('the pending goal has no shape buttons and deletes only by a hold', () => {
  const { onDelete } = setup({ goal: true, done: false });
  expect(screen.queryByRole('button', { name: 'Step' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Sub-goal' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Large' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
  const hold = screen.getByRole('button', { name: 'Hold to delete the line' });
  expect(hold).toHaveAttribute('data-target', 'hold');
  expect(hold).toHaveAttribute('data-id', 'delete');
  fireEvent.click(hold);
  expect(onDelete).not.toHaveBeenCalled();
});

test('the editor shows a chip per line and leaving one removes the stop from it', () => {
  const { onLeave } = setup({
    goal: false,
    done: false,
    lines: [
      { trackId: 't1', color: 0 },
      { trackId: 'day', color: null },
    ],
  });
  const chips = screen.getAllByRole('button', { name: 'Leave line' });
  expect(chips.map((c) => c.dataset.track)).toEqual(['t1', 'day']);
  expect(chips[0].style.getPropertyValue('--track-color')).toBe('var(--track-blue)');
  // The day line is ink.
  expect(chips[1].style.getPropertyValue('--track-color')).toBe('var(--ink)');
  expect(chips[0]).toHaveTextContent('');
  fireEvent.click(chips[1]);
  expect(onLeave).toHaveBeenCalledWith('day');
});

test('a stop on one line shows no chips', () => {
  setup({ goal: false, done: false, lines: [] });
  expect(screen.queryByRole('button', { name: 'Leave line' })).not.toBeInTheDocument();
  expect(document.querySelector('.line-chips')).toBeNull();
});

test("the day's-end square offers only a hold that deletes the day", () => {
  const { onDelete } = setup({ goal: false, dayEnd: true, done: false });
  expect(screen.queryByRole('textbox', { name: 'Stop title' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Step' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Sub-goal' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Medium' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
  const hold = screen.getByRole('button', { name: 'Hold to delete the day' });
  expect(hold).toHaveAttribute('data-target', 'hold');
  expect(hold).toHaveAttribute('data-id', 'delete');
  fireEvent.click(hold);
  expect(onDelete).not.toHaveBeenCalled();
});

test("a done day's-end square offers Not done and the hold", () => {
  const { onUndo } = setup({ goal: false, dayEnd: true, done: true });
  fireEvent.click(screen.getByRole('button', { name: 'Not done' }));
  expect(onUndo).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: 'Hold to delete the day' })).toBeInTheDocument();
});

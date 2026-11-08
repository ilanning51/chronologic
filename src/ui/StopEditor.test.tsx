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
  lines?: { trackId: string; color: number | null; name: string }[];
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
      { trackId: 't1', color: 0, name: 'Wristband' },
      { trackId: 'day', color: null, name: 'today' },
    ],
  });
  // Each chip is named by its line, so a screen reader can tell them apart.
  const chips = screen.getAllByRole('button', { name: /^Leave / });
  expect(chips.map((c) => c.getAttribute('aria-label'))).toEqual(['Leave Wristband', 'Leave today']);
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
  expect(screen.queryByRole('button', { name: /^Leave / })).not.toBeInTheDocument();
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

/** A pending goal's editor with every handler a spy, re-renderable with a picture. */
function goalEditor(image?: string) {
  const onPicture = vi.fn();
  const onEdit = vi.fn();
  const editor = (picture?: string) => (
    <StopEditor
      stop={{ ...stop, shape: 'square', done: false, ...(picture !== undefined ? { image: picture } : {}) }}
      goal
      done={false}
      holding={false}
      lines={[]}
      onEdit={onEdit}
      onPicture={onPicture}
      onDelete={vi.fn()}
      onUndo={vi.fn()}
      onClose={vi.fn()}
      onLeave={vi.fn()}
    />
  );
  const { rerender } = render(editor(image));
  return { onPicture, onEdit, rerender: (picture?: string) => rerender(editor(picture)) };
}

test('a pending goal offers a picture from the device, and lets one go again', () => {
  const { onPicture, onEdit, rerender } = goalEditor();
  expect(screen.getByRole('button', { name: 'Picture' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'No picture' })).not.toBeInTheDocument();
  const chooser = screen.getByLabelText('Choose a picture') as HTMLInputElement;
  expect(chooser).toHaveAttribute('accept', 'image/*');
  const file = new File(['x'], 'ship.jpg', { type: 'image/jpeg' });
  fireEvent.change(chooser, { target: { files: [file] } });
  expect(onPicture).toHaveBeenCalledWith(file);

  rerender('data:image/jpeg;base64,AAAA');
  fireEvent.click(screen.getByRole('button', { name: 'No picture' }));
  expect(onEdit).toHaveBeenCalledWith({ image: null });
});

test('a plain stop offers no picture', () => {
  setup({ goal: false, done: false });
  expect(screen.queryByRole('button', { name: 'Picture' })).not.toBeInTheDocument();
});

test('a marker, a square that is no goal, offers a size and Delete but no shape to change it to', () => {
  const handlers = { onEdit: vi.fn(), onDelete: vi.fn(), onUndo: vi.fn(), onClose: vi.fn(), onLeave: vi.fn() };
  render(<StopEditor stop={{ ...stop, shape: 'square', done: false }} goal={false} done={false} holding={false} lines={[]} {...handlers} />);
  expect(screen.queryByRole('button', { name: 'Step' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Sub-goal' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
  expect(handlers.onDelete).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: 'Large' })).toBeInTheDocument();
});

/** The editor on a pending stop with its times, and its handlers. */
function withTimes(times: { leg: number; after: string; fromNow: number; editable: boolean }) {
  const handlers = { onEdit: vi.fn(), onDelete: vi.fn(), onUndo: vi.fn(), onClose: vi.fn(), onLeave: vi.fn(), onLeg: vi.fn(), onArrival: vi.fn() };
  render(<StopEditor stop={{ ...stop, done: false }} goal={false} done={false} holding={false} lines={[]} times={times} {...handlers} />);
  return handlers;
}

test('a pending stop shows the leg into it, what it comes after, and how long until its train gets there', () => {
  withTimes({ leg: 1799.9996, after: 'Flowers', fromNow: 259_199.99, editable: true });
  expect(screen.getByRole('textbox', { name: 'Time after Flowers' })).toHaveValue('30 min');
  expect(screen.getByRole('textbox', { name: 'Time from now' })).toHaveValue('3 d');
  expect(screen.getByText('after Flowers')).toBeInTheDocument();
  expect(screen.getByText('from now')).toBeInTheDocument();
});

test('a typed leg goes up on Return as seconds, and the editor stays open', () => {
  const { onLeg, onClose } = withTimes({ leg: 1800, after: 'Flowers', fromNow: 5000, editable: true });
  const field = screen.getByRole('textbox', { name: 'Time after Flowers' });
  fireEvent.focus(field);
  fireEvent.change(field, { target: { value: '45 min' } });
  fireEvent.keyDown(field, { key: 'Enter' });
  expect(onLeg).toHaveBeenCalledWith(2700);
  expect(onClose).not.toHaveBeenCalled();
});

test('a typed time from now goes up when the field is left', () => {
  const { onArrival } = withTimes({ leg: 1800, after: 'Flowers', fromNow: 5000, editable: true });
  const field = screen.getByRole('textbox', { name: 'Time from now' });
  fireEvent.focus(field);
  fireEvent.change(field, { target: { value: '3 days' } });
  fireEvent.blur(field);
  expect(onArrival).toHaveBeenCalledWith(259_200);
});

test('text that is not a duration puts back the time it had, and Escape puts it back without closing', () => {
  const { onLeg, onClose } = withTimes({ leg: 1800, after: 'Flowers', fromNow: 5000, editable: true });
  const field = screen.getByRole('textbox', { name: 'Time after Flowers' });
  fireEvent.change(field, { target: { value: 'soon' } });
  fireEvent.keyDown(field, { key: 'Enter' });
  expect(field).toHaveValue('30 min');
  fireEvent.change(field, { target: { value: '2 h' } });
  fireEvent.keyDown(field, { key: 'Escape' });
  expect(field).toHaveValue('30 min');
  fireEvent.blur(field);
  expect(onLeg).not.toHaveBeenCalled();
  expect(onClose).not.toHaveBeenCalled();
});

test('passing through the fields without typing sends nothing', () => {
  const { onLeg, onArrival } = withTimes({ leg: 1800.4, after: 'Flowers', fromNow: 5000, editable: true });
  for (const name of ['Time after Flowers', 'Time from now']) {
    const field = screen.getByRole('textbox', { name });
    fireEvent.focus(field);
    fireEvent.keyDown(field, { key: 'Enter' });
    fireEvent.blur(field);
  }
  expect(onLeg).not.toHaveBeenCalled();
  expect(onArrival).not.toHaveBeenCalled();
});

test('times that cannot be typed are shown as words, and a stop the train is at reads now', () => {
  withTimes({ leg: 1800, after: 'the start', fromNow: 0, editable: false });
  expect(screen.queryByRole('textbox', { name: /^Time/ })).not.toBeInTheDocument();
  expect(screen.getByText('30 min')).toBeInTheDocument();
  expect(screen.getByText('after the start')).toBeInTheDocument();
  expect(screen.getByText('now')).toBeInTheDocument();
});

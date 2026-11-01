import { render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { NameField } from './NameField';

afterEach(() => {
  vi.restoreAllMocks();
});

/** jsdom lays nothing out, so give the field the size a browser would. */
function sized(w: number, h: number) {
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(w);
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(h);
}

const field = () => screen.getByRole('textbox', { name: 'Stop title' }).parentElement!;
const noop = () => {};

test('a field that would hang off the bottom right is pulled fully on screen', () => {
  sized(180, 36);
  render(<NameField x={950} y={790} viewport={{ w: 1000, h: 800 }} label="Stop title" onCommit={noop} onCancel={noop} />);
  expect(field().style.left).toBe('820px');
  expect(field().style.top).toBe('764px');
});

test('a field that would hang off the top left is pulled fully on screen', () => {
  sized(180, 36);
  render(<NameField x={-76} y={-116} viewport={{ w: 1000, h: 800 }} label="Stop title" onCommit={noop} onCancel={noop} />);
  expect(field().style.left).toBe('0px');
  expect(field().style.top).toBe('0px');
});

test('a field with room stays where it was asked to be', () => {
  sized(180, 36);
  render(<NameField x={300} y={200} viewport={{ w: 1000, h: 800 }} label="Stop title" onCommit={noop} onCancel={noop} />);
  expect(field().style.left).toBe('300px');
  expect(field().style.top).toBe('200px');
});

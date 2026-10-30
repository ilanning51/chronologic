import { expect, test } from 'vitest';
import { KIND_ORDER, KINDS } from './kinds';

test('every kind carries its initial, color and word', () => {
  for (const kind of KIND_ORDER) {
    expect(KINDS[kind].initial).toBe(KINDS[kind].word[0]);
    expect(KINDS[kind].color).toMatch(/^#[0-9A-F]{6}$/);
  }
  expect(KINDS.deep.color).toBe('#2440A4');
  expect(KINDS.shallow.color).toBe('#A67C00');
  expect(KINDS.body.color).toBe('#1F7A3A');
  expect(KINDS.out.color).toBe('#C4251F');
});

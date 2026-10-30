import { expect, test } from 'vitest';
import { LABEL_HIDE_BELOW, labelFontPx } from './labels';

test('labels hold 13 px, grow to 17, then hide', () => {
  expect(labelFontPx(1)).toBe(13);
  expect(labelFontPx(0.7)).toBe(13);
  expect(labelFontPx(1.2)).toBeCloseTo(15.6);
  expect(labelFontPx(1.6)).toBe(17);
  expect(labelFontPx(4)).toBe(17);
  expect(labelFontPx(LABEL_HIDE_BELOW)).toBe(13);
  expect(labelFontPx(0.4)).toBeNull();
});

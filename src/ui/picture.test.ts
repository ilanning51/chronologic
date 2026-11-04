import { expect, test } from 'vitest';
import { PALETTE } from '../model/palette';
import { DAY_PAPER } from '../plane/daylight';
import { INKS, nearestInk, paint, PICTURE_PX } from './picture';

test('the inks are the paper, the ink, the muted ink and the eight track colours', () => {
  expect(INKS).toHaveLength(11);
  expect(INKS[0]).toBe(DAY_PAPER);
  expect(INKS.slice(3)).toEqual(PALETTE.map((c) => c.color));
  expect(PICTURE_PX).toBe(16);
});

test('a colour snaps to the nearest ink: an ink to itself, white to paper, black to ink, a sky blue to blue', () => {
  for (const ink of INKS) {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(ink.slice(i, i + 2), 16));
    expect(nearestInk(r, g, b)).toBe(ink);
  }
  expect(nearestInk(255, 255, 255)).toBe(DAY_PAPER);
  expect(nearestInk(0, 0, 0)).toBe('#2B2420');
  expect(nearestInk(40, 70, 180)).toBe('#2440A4');
  expect(nearestInk(200, 40, 30)).toBe('#C4251F');
});

test('paint snaps every pixel and makes it opaque, leaving the given buffer alone', () => {
  const pixels = new Uint8ClampedArray([255, 255, 255, 10, 0, 0, 0, 255, 35, 72, 170, 128]);
  const painted = paint(pixels);
  expect([...painted]).toEqual([0xee, 0xeb, 0xe5, 255, 0x2b, 0x24, 0x20, 255, 0x24, 0x40, 0xa4, 255]);
  expect(pixels[3]).toBe(10);
});

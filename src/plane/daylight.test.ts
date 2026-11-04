import { expect, test } from 'vitest';
import { applyDaylight, DAY_PAPER, gridTint, hourOf, PAPER_BY_HOUR, paperAt } from './daylight';

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

test('by day the paper is the design paper, and the grid is the design grid', () => {
  expect(paperAt(10)).toBe(DAY_PAPER);
  expect(paperAt(13.5)).toBe(DAY_PAPER);
  expect(paperAt(16)).toBe(DAY_PAPER);
  expect(gridTint(DAY_PAPER)).toBe('#E0DCD5');
});

test('dusk is warmer than day and dawn is cooler, each by a flat tint', () => {
  const [dr, , db] = rgb(DAY_PAPER);
  const [r, , b] = rgb(paperAt(19));
  expect(r - b).toBeGreaterThan(dr - db);
  const [ar, , ab] = rgb(paperAt(7));
  expect(ar - ab).toBeLessThan(dr - db);
});

test('between keyframes the paper is mixed in proportion, and the day wraps at midnight', () => {
  // Halfway from the day paper (16) to dusk (19).
  const day = rgb(DAY_PAPER);
  const dusk = rgb(paperAt(19));
  const mid = rgb(paperAt(17.5));
  for (let k = 0; k < 3; k++) expect(mid[k]).toBe(Math.round((day[k] + dusk[k]) / 2));
  expect(paperAt(24)).toBe(paperAt(0));
  expect(paperAt(-1)).toBe(paperAt(23));
  // Every keyframe is a real colour.
  for (const { paper } of PAPER_BY_HOUR) expect(paper).toMatch(/^#[0-9A-F]{6}$/);
});

test('the hour reads minutes as a fraction, and applying writes both tokens', () => {
  expect(hourOf(new Date(2026, 10, 3, 19, 30))).toBe(19.5);
  const written: Record<string, string> = {};
  applyDaylight({ style: { setProperty: (n, v) => (written[n] = v) } }, new Date(2026, 10, 3, 12, 0));
  expect(written).toEqual({ '--paper': DAY_PAPER, '--grid': '#E0DCD5' });
});

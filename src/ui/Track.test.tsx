import { render } from '@testing-library/react';
import { expect, test } from 'vitest';
import { layoutTrack } from '../plane/layout';
import { TRACK_WIDTH } from '../plane/world';
import { withWeek } from '../test/fixtures';
import { Track } from './Track';

test("tomorrow's day line is drawn muted and half as wide; today's is ink at full width", () => {
  const w = withWeek('2026-11-01');
  const noon = new Date(2026, 10, 1, 12).getTime();
  const camera = { x: 100, y: 100, scale: 0.1 };
  const strokes = (id: string) => {
    const view = layoutTrack(w.tracks.find((t) => t.id === id)!, w, camera, noon, { w: 1000, h: 800 });
    const { container, unmount } = render(<Track view={view} />);
    const ahead = [...container.querySelectorAll<SVGLineElement>('line:not(.behind)')].map((l) => [l.style.stroke, l.style.strokeWidth]);
    const train = (container.querySelector('[data-train]') as SVGElement).style.fill;
    unmount();
    return { ahead, train };
  };
  const tomorrow = strokes('day2');
  expect(tomorrow.ahead.length).toBeGreaterThan(0);
  for (const s of tomorrow.ahead) expect(s).toEqual(['var(--muted)', String(TRACK_WIDTH / 2)]);
  expect(tomorrow.train).toBe('var(--muted)');
  const today = strokes('day');
  expect(today.ahead.length).toBeGreaterThan(0);
  for (const s of today.ahead) expect(s).toEqual(['var(--ink)', String(TRACK_WIDTH)]);
});

test('a line runs on a casing of paper a little wider than it, beneath it, so a line crossing it parts it with white', () => {
  const w = withWeek('2026-11-01');
  const noon = new Date(2026, 10, 1, 12).getTime();
  const view = layoutTrack(w.tracks.find((t) => t.id === 'day')!, w, { x: 100, y: 100, scale: 0.1 }, noon, { w: 1000, h: 800 });
  const { container } = render(<Track view={view} />);
  const casing = container.querySelector<SVGPathElement>('path.casing')!;
  expect(casing.style.stroke).toBe('var(--paper)');
  expect(parseFloat(casing.style.strokeWidth)).toBeCloseTo(TRACK_WIDTH * 1.22);
  // First in the svg, so every stroke of the line lies on it.
  expect(casing.parentElement!.firstElementChild).toBe(casing);
  expect(casing.getAttribute('d')!.match(/M/g)).toHaveLength(view.behind.length + view.segments.length);
});

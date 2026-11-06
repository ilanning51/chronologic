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

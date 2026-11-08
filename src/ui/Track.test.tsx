import { render } from '@testing-library/react';
import { expect, test } from 'vitest';
import { layoutTrack } from '../plane/layout';
import { LIFE_WIDTH, TRACK_WIDTH, TRAIN } from '../plane/world';
import { withLife, withWeek } from '../test/fixtures';
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

test('the life line is ink at one and a half lines, with no casing, no origin handle and an ink train; the road behind the train is muted', () => {
  expect(LIFE_WIDTH).toBe(TRACK_WIDTH * 1.5);
  const w = withLife();
  const life = w.tracks.find((t) => t.life)!;
  // The train has passed Start, so there is road behind it and road ahead.
  w.stops.find((s) => s.id === 'start')!.done = true;
  life.train = { leg: 1, departedAt: 0 };
  const view = layoutTrack(life, w, { x: 100, y: 500, scale: 0.1 }, 1000, { w: 1000, h: 800 });
  const { container } = render(<Track view={view} />);
  expect(container.querySelector('[data-target="origin"]')).toBeNull();
  expect(container.querySelector('path.casing')).toBeNull();
  const ahead = [...container.querySelectorAll<SVGLineElement>('line:not(.behind)')];
  const behind = [...container.querySelectorAll<SVGLineElement>('line.behind')];
  expect(ahead.length).toBeGreaterThan(0);
  expect(behind.length).toBeGreaterThan(0);
  for (const l of ahead) expect([l.style.stroke, l.style.strokeWidth]).toEqual(['var(--ink)', String(LIFE_WIDTH)]);
  for (const l of behind) expect([l.style.stroke, l.style.strokeWidth]).toEqual(['var(--muted)', String(LIFE_WIDTH)]);
  const train = container.querySelector('[data-train]') as SVGElement;
  expect(train.style.fill).toBe('var(--ink)');
  // Twice a project train.
  expect(Number(train.getAttribute('width'))).toBe(TRAIN.length * 2);
  expect(Number(train.getAttribute('height'))).toBe(TRAIN.width * 2);
});

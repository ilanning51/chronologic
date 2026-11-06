import { act, render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { reduce } from '../model/reducer';
import type { World } from '../model/types';
import { weekLines } from '../test/fixtures';
import { WeekWindow } from './WeekWindow';

const at = (d: number, h: number, min = 0) => new Date(2026, 10, d, h, min).getTime();
/** Friday 6 November 2026, noon. */
const now = at(6, 12);

const day = (date: string) => document.querySelector(`[data-week-day="${date}"]`) as HTMLButtonElement;
const heading = () => screen.getByRole('heading', { level: 2 }).textContent;
const place = (w: World, stopId: string, date: string, end: number, length: number) =>
  reduce(w, { type: 'place', stopId, date, end, length, now, dayId: 'd', endId: 'e' });

describe('the week row', () => {
  test('opens on tomorrow, with today marked and the chosen day pressed; both show on today', () => {
    render(<WeekWindow world={weekLines(now)} now={now} />);
    expect(heading()).toBe('This week');
    expect(day('2026-11-07')).toHaveAttribute('aria-pressed', 'true');
    expect(day('2026-11-06')).toHaveClass('today');
    expect(day('2026-11-06')).toHaveAttribute('aria-pressed', 'false');
    // Monday to Sunday, Thursday's gone by.
    expect([...document.querySelectorAll('[data-week-day]')].map((b) => b.textContent)).toEqual([
      'Mon',
      'Tue',
      'Wed',
      'Thu',
      'Fri',
      'Sat',
      'Sun',
    ]);
    expect(day('2026-11-05')).toHaveClass('past');
    expect(day('2026-11-07')).not.toHaveClass('past');
    act(() => day('2026-11-06').click());
    expect(day('2026-11-06')).toHaveClass('today');
    expect(day('2026-11-06')).toHaveAttribute('aria-pressed', 'true');
  });

  test('the arrows step a week at a time and name it', () => {
    render(<WeekWindow world={weekLines(now)} now={now} />);
    act(() => screen.getByRole('button', { name: 'Next week' }).click());
    expect(heading()).toBe('Next week');
    expect(day('2026-11-09')).toBeInTheDocument();
    expect(day('2026-11-14')).toHaveAttribute('aria-pressed', 'true');
    act(() => screen.getByRole('button', { name: 'Previous week' }).click());
    act(() => screen.getByRole('button', { name: 'Previous week' }).click());
    expect(heading()).toBe('Last week');
  });
});

describe('the next stops', () => {
  test("list each line's next stop soonest first; a sketch's goal is muted capitals", () => {
    render(<WeekWindow world={weekLines(now)} now={now} />);
    const rows = [...document.querySelectorAll('[data-candidate]')];
    expect(rows.map((r) => r.getAttribute('data-candidate'))).toEqual(['alpha', 'charlie', 'dream']);
    expect(rows[2]).toHaveClass('sketch');
    expect(screen.getByText('dream')).toHaveClass('goal-name');
    expect(screen.getByText('alpha')).not.toHaveClass('goal-name');
  });

  test('with no lines the window is empty and says nothing', () => {
    render(<WeekWindow world={{ tracks: [], stops: [], lastTouched: null }} now={now} />);
    expect(document.querySelectorAll('[data-candidate]')).toHaveLength(0);
    expect(document.querySelectorAll('[data-block]')).toHaveLength(0);
    expect(screen.getByLabelText('Next stops').textContent).toBe('Next stops');
  });
});

describe('the day plane', () => {
  test('a placed block shows its name and when it starts and ends', () => {
    const w = place(weekLines(now), 'alpha', '2026-11-07', at(7, 11), 3600);
    render(<WeekWindow world={w} now={now} />);
    const block = document.querySelector('[data-block="alpha"]') as HTMLElement;
    expect(block).toHaveTextContent('alpha');
    expect(block).toHaveTextContent('10:00 – 11:00');
    expect(block.style.background).toBe('var(--track-blue)');
    // Another day has nothing on it.
    act(() => day('2026-11-08').click());
    expect(document.querySelector('[data-block]')).toBeNull();
  });

  test('today has a now line and other days do not', () => {
    render(<WeekWindow world={weekLines(now)} now={now} />);
    expect(document.querySelector('.week-now')).toBeNull();
    act(() => day('2026-11-06').click());
    expect(document.querySelector('.week-now')).toBeInTheDocument();
  });

  test('the hours run from 12 am down to 11 pm', () => {
    render(<WeekWindow world={weekLines(now)} now={now} />);
    const labels = [...document.querySelectorAll('.week-hour span')].map((s) => s.textContent);
    expect(labels[0]).toBe('1 AM');
    expect(labels).toContain('12 PM');
    expect(labels[labels.length - 1]).toBe('11 PM');
  });
});

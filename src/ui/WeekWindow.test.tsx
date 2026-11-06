import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { arrivalOf, reach } from '../model/arrive';
import { dayWith } from '../model/day';
import { reduce } from '../model/reducer';
import { createStore } from '../store/store';
import { DAY_HEIGHT, PX_PER_HOUR, yOf } from '../plane/week';
import type { World } from '../model/types';
import { weekLines } from '../test/fixtures';
import { WeekWindow } from './WeekWindow';

const at = (d: number, h: number, min = 0) => new Date(2026, 10, d, h, min).getTime();
/** Friday 6 November 2026, noon. */
const now = at(6, 12);

const day = (date: string) => document.querySelector(`[data-week-day="${date}"]`) as HTMLButtonElement;
const heading = () => screen.getByRole('heading', { level: 2 }).textContent;
/** The window over a store of this world, drawn and dropped at `now`. */
function open(w: World) {
  const store = createStore(w);
  render(<WeekWindow store={store} now={now} clock={() => now} />);
  return store;
}
const place = (w: World, stopId: string, date: string, end: number, length: number) =>
  reduce(w, { type: 'place', stopId, date, end, length, now, dayId: 'd', endId: 'e' });

describe('the week row', () => {
  test('opens on tomorrow, with today marked and the chosen day pressed; both show on today', () => {
    open(weekLines(now));
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
    open(weekLines(now));
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
    open(weekLines(now));
    const rows = [...document.querySelectorAll('[data-candidate]')];
    expect(rows.map((r) => r.getAttribute('data-candidate'))).toEqual(['alpha', 'charlie', 'dream']);
    expect(rows[2]).toHaveClass('sketch');
    expect(screen.getByText('dream')).toHaveClass('goal-name');
    expect(screen.getByText('alpha')).not.toHaveClass('goal-name');
  });

  test('with no lines the window is empty and says nothing', () => {
    open({ tracks: [], stops: [], lastTouched: null });
    expect(document.querySelectorAll('[data-candidate]')).toHaveLength(0);
    expect(document.querySelectorAll('[data-block]')).toHaveLength(0);
    expect(screen.getByLabelText('Next stops').textContent).toBe('Next stops');
  });
});

describe('the day plane', () => {
  test('a placed block shows its name and when it starts and ends', () => {
    const w = place(weekLines(now), 'alpha', '2026-11-07', at(7, 11), 3600);
    open(w);
    const block = document.querySelector('[data-block="alpha"]') as HTMLElement;
    expect(block).toHaveTextContent('alpha');
    expect(block).toHaveTextContent('10:00 – 11:00');
    expect(block.style.background).toBe('var(--track-blue)');
    // Another day has nothing on it.
    act(() => day('2026-11-08').click());
    expect(document.querySelector('[data-block]')).toBeNull();
  });

  test('today has a now line and other days do not', () => {
    open(weekLines(now));
    expect(document.querySelector('.week-now')).toBeNull();
    act(() => day('2026-11-06').click());
    expect(document.querySelector('.week-now')).toBeInTheDocument();
  });

  test('the hours run from 12 am down to 11 pm', () => {
    open(weekLines(now));
    const labels = [...document.querySelectorAll('.week-hour span')].map((s) => s.textContent);
    expect(labels[0]).toBe('1 AM');
    expect(labels).toContain('12 PM');
    expect(labels[labels.length - 1]).toBe('11 PM');
  });
});

describe('dragging', () => {
  const S = 1000;
  const dayPlane = () => screen.getByLabelText('Day plane');
  /** The screen y of an hour of the day on the day plane, as it is scrolled. */
  const rowY = (hours: number) => hours * PX_PER_HOUR - dayPlane().scrollTop;
  const near = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThanOrEqual(S);
  const candidate = (id: string) => document.querySelector(`[data-candidate="${id}"]`)!;
  const block = (id: string) => document.querySelector(`[data-block="${id}"]`)!;
  const saturday = () => place(weekLines(now), 'alpha', '2026-11-07', at(7, 11), 3600);

  /** Presses on `from`, moves over each place in turn, and lets go over the last. */
  function drag(from: Element, fromY: number, ...over: { el: Element; y: number }[]) {
    fireEvent.pointerDown(from, { pointerId: 1, button: 0, clientX: 300, clientY: fromY });
    for (const o of over) fireEvent.pointerMove(o.el, { pointerId: 1, buttons: 1, clientX: 400, clientY: o.y });
    const last = over[over.length - 1];
    fireEvent.pointerUp(last.el, { pointerId: 1, clientX: 400, clientY: last.y });
  }

  afterEach(() => {
    vi.useRealTimers();
  });

  test('a next stop dropped on the 10:00 row of tomorrow is placed from 10:00 to its default end, one step undo takes back', () => {
    const store = open(weekLines(now));
    drag(candidate('alpha'), 100, { el: dayPlane(), y: rowY(10) });
    expect(dayWith(store.getState(), 'alpha')?.day?.date).toBe('2026-11-07');
    near(arrivalOf(store.getState(), 'alpha', now), at(7, 11));
    expect(block('alpha')).toHaveTextContent('10:00 – 11:00');
    act(() => store.undo());
    expect(dayWith(store.getState(), 'alpha')).toBeFalsy();
    expect(store.canUndo()).toBe(false);
  });

  test('moving a block from 10:00 to 14:00 moves the arrival of its stop on the map to its new end', () => {
    const store = open(saturday());
    drag(block('alpha'), rowY(10) + 5, { el: dayPlane(), y: rowY(14) + 5 });
    near(arrivalOf(store.getState(), 'alpha', now), at(7, 15));
    expect(block('alpha')).toHaveTextContent('2:00 – 3:00');
  });

  test('stretching a block by its bottom edge to 11:30 keeps its start at 10:00', () => {
    const store = open(saturday());
    const handle = document.querySelector('[data-handle="alpha"]')!;
    drag(handle, rowY(11) - 2, { el: dayPlane(), y: rowY(11.5) });
    near(arrivalOf(store.getState(), 'alpha', now), at(7, 11, 30));
    const day = dayWith(store.getState(), 'alpha')!;
    expect(day.day!.lengths[day.stops.indexOf('alpha')]).toBe(5400);
    expect(block('alpha')).toHaveTextContent('10:00 – 11:30');
  });

  test('a block dropped on the Next stops column comes off its day, and its stop stays where it was', () => {
    const w = saturday();
    const store = open(w);
    drag(block('alpha'), rowY(10) + 5, { el: screen.getByLabelText('Next stops'), y: 100 });
    expect(dayWith(store.getState(), 'alpha')).toBeFalsy();
    expect(store.getState().stops.find((s) => s.id === 'alpha')).toEqual(w.stops.find((s) => s.id === 'alpha'));
    expect(candidate('alpha')).toBeInTheDocument();
  });

  test('dragged past the latest its line allows, the block ends at that latest arrival', () => {
    // Bravo close behind Alpha: Alpha can arrive no later than a little before Bravo does.
    const w = weekLines(now);
    w.stops = w.stops.map((s) => (s.id === 'bravo' ? { ...s, x: 110000 } : s));
    const latest = reach(w, 'alpha', now)!.latest!;
    expect(latest).toBeGreaterThan(at(7, 0));
    expect(latest).toBeLessThan(at(7, 22));
    const store = open(w);
    drag(candidate('alpha'), 100, { el: dayPlane(), y: rowY(22) });
    near(arrivalOf(store.getState(), 'alpha', now), latest);
  });

  test('a drop the world refuses is shown muted, changes nothing, and leaves the step before it to undo', () => {
    const store = open(weekLines(now));
    act(() => store.dispatch({ type: 'place', stopId: 'alpha', date: '2026-11-08', end: at(8, 11), length: 3600, now, dayId: 'd', endId: 'e' }));
    const placed = store.getState();
    // Bravo comes after Alpha, which now arrives on Sunday: nothing on Friday is in reach.
    act(() => day('2026-11-06').click());
    fireEvent.pointerDown(candidate('bravo'), { pointerId: 1, button: 0, clientX: 300, clientY: 100 });
    fireEvent.pointerMove(dayPlane(), { pointerId: 1, buttons: 1, clientX: 400, clientY: rowY(20) });
    expect(document.querySelector('.week-ghost')).toHaveClass('refused');
    fireEvent.pointerUp(dayPlane(), { pointerId: 1, clientX: 400, clientY: rowY(20) });
    expect(store.getState()).toBe(placed);
    expect(document.querySelector('.week-ghost')).toBeNull();
    act(() => store.undo());
    expect(dayWith(store.getState(), 'alpha')).toBeFalsy();
  });

  test('held over the Sunday button, the plane turns to Sunday and the drop lands there', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    const store = open(weekLines(now));
    fireEvent.pointerDown(candidate('alpha'), { pointerId: 1, button: 0, clientX: 300, clientY: 100 });
    fireEvent.pointerMove(day('2026-11-08'), { pointerId: 1, buttons: 1, clientX: 400, clientY: 40 });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(day('2026-11-08')).toHaveAttribute('aria-pressed', 'true');
    fireEvent.pointerMove(dayPlane(), { pointerId: 1, buttons: 1, clientX: 400, clientY: rowY(10) });
    fireEvent.pointerUp(dayPlane(), { pointerId: 1, clientX: 400, clientY: rowY(10) });
    expect(dayWith(store.getState(), 'alpha')?.day?.date).toBe('2026-11-08');
  });

  test('a finger that moves at once scrolls; one that rests first drags', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    const w = weekLines(now);
    const store = open(w);
    const finger = { pointerId: 2, button: 0, pointerType: 'touch', clientX: 300 };
    // A scroll that pauses partway is still a scroll.
    fireEvent.pointerDown(candidate('alpha'), { ...finger, clientY: 100 });
    fireEvent.pointerMove(dayPlane(), { ...finger, clientY: 130 });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    fireEvent.pointerMove(dayPlane(), { ...finger, clientY: rowY(10) });
    fireEvent.pointerUp(dayPlane(), { ...finger, clientY: rowY(10) });
    expect(store.getState()).toBe(w);
    fireEvent.pointerDown(candidate('alpha'), { ...finger, clientY: 100 });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    fireEvent.pointerMove(dayPlane(), { ...finger, clientY: rowY(10) });
    fireEvent.pointerUp(dayPlane(), { ...finger, clientY: rowY(10) });
    expect(dayWith(store.getState(), 'alpha')?.day?.date).toBe('2026-11-07');
  });

  test('a tap on a block changes nothing', () => {
    const w = saturday();
    const store = open(w);
    fireEvent.pointerDown(block('alpha'), { pointerId: 1, button: 0, clientX: 300, clientY: rowY(10) + 5 });
    fireEvent.pointerUp(block('alpha'), { pointerId: 1, button: 0, clientX: 300, clientY: rowY(10) + 5 });
    expect(store.getState()).toBe(w);
    expect(store.canUndo()).toBe(false);
  });

  test('a finger that rests on a block and lifts without moving changes nothing', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    const w = saturday();
    const store = open(w);
    const finger = { pointerId: 2, button: 0, pointerType: 'touch', clientX: 300, clientY: rowY(10) + 5 };
    fireEvent.pointerDown(block('alpha'), finger);
    act(() => {
      vi.advanceTimersByTime(400);
    });
    fireEvent.pointerUp(block('alpha'), finger);
    expect(store.getState()).toBe(w);
    expect(store.canUndo()).toBe(false);
  });

  test('a mouse let go where the page could not hear it ends the drag, and the next click drops nothing', () => {
    const w = weekLines(now);
    const store = open(w);
    fireEvent.pointerDown(candidate('alpha'), { pointerId: 1, button: 0, clientX: 300, clientY: 100 });
    fireEvent.pointerMove(dayPlane(), { pointerId: 1, buttons: 1, clientX: 400, clientY: rowY(10) });
    expect(document.querySelector('.week-ghost')).toBeInTheDocument();
    // Back from a right-click menu with the button already up.
    fireEvent.pointerMove(dayPlane(), { pointerId: 1, buttons: 0, clientX: 400, clientY: rowY(12) });
    expect(document.querySelector('.week-ghost')).toBeNull();
    fireEvent.pointerUp(dayPlane(), { pointerId: 1, clientX: 400, clientY: rowY(12) });
    expect(store.getState()).toBe(w);
    expect(store.canUndo()).toBe(false);
  });

  test('leaving the window mid-drag ends the drag and drops nothing', () => {
    const w = weekLines(now);
    const store = open(w);
    fireEvent.pointerDown(candidate('alpha'), { pointerId: 1, button: 0, clientX: 300, clientY: 100 });
    fireEvent.pointerMove(dayPlane(), { pointerId: 1, buttons: 1, clientX: 400, clientY: rowY(10) });
    fireEvent.blur(window);
    expect(document.querySelector('.week-ghost')).toBeNull();
    fireEvent.pointerUp(dayPlane(), { pointerId: 1, clientX: 400, clientY: rowY(10) });
    expect(store.getState()).toBe(w);
  });

  test('held near the bottom edge the day scrolls under the block, and stops once it is back mid-plane', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    open(weekLines(now));
    const plane = dayPlane();
    // jsdom lays nothing out: the plane is given a 600 px tall box at the top of the screen.
    plane.getBoundingClientRect = () => ({ top: 0, bottom: 600, height: 600, left: 0, right: 800, width: 800, x: 0, y: 0, toJSON: () => ({}) });
    fireEvent.pointerDown(candidate('alpha'), { pointerId: 1, button: 0, clientX: 300, clientY: 100 });
    fireEvent.pointerMove(plane, { pointerId: 1, buttons: 1, clientX: 400, clientY: 590 });
    const before = plane.scrollTop;
    act(() => {
      vi.advanceTimersByTime(160);
    });
    expect(plane.scrollTop).toBeGreaterThan(before);
    fireEvent.pointerMove(plane, { pointerId: 1, buttons: 1, clientX: 400, clientY: 300 });
    const stopped = plane.scrollTop;
    act(() => {
      vi.advanceTimersByTime(160);
    });
    expect(plane.scrollTop).toBe(stopped);
    fireEvent.pointerUp(plane, { pointerId: 1, clientX: 400, clientY: 300 });
  });

  test('a done block has no handle and does not drag', () => {
    const w = saturday();
    w.stops = w.stops.map((s) => (s.id === 'alpha' ? { ...s, done: true, doneAt: at(7, 10, 30) } : s));
    const store = open(w);
    expect(block('alpha')).toHaveClass('done');
    expect(block('alpha').querySelector('.shape')).toHaveClass('dot');
    expect(document.querySelector('[data-handle]')).toBeNull();
    drag(block('alpha'), rowY(10) + 5, { el: dayPlane(), y: rowY(14) });
    expect(store.getState()).toBe(w);
  });

  describe('the hours a held block cannot reach', () => {
    const shades = () => [...document.querySelectorAll<HTMLElement>('.week-reach')].map((el) => ({ top: parseFloat(el.style.top), height: parseFloat(el.style.height) }));
    /** Bravo close behind Alpha, so Alpha must arrive on Saturday before Bravo does. */
    const close = () => {
      const w = weekLines(now);
      w.stops = w.stops.map((s) => (s.id === 'bravo' ? { ...s, x: 110000 } : s));
      return w;
    };
    const hold = (from: Element, over: Element, y: number) => {
      fireEvent.pointerDown(from, { pointerId: 1, button: 0, clientX: 300, clientY: 100 });
      fireEvent.pointerMove(over, { pointerId: 1, buttons: 1, clientX: 400, clientY: y });
    };

    test('none are shaded while nothing is held', () => {
      open(close());
      expect(shades()).toEqual([]);
    });

    test("held, a block's day is shaded from its line's latest arrival down, and the shade goes with the drop", () => {
      const w = close();
      const latest = reach(w, 'alpha', now)!.latest!;
      open(w);
      hold(candidate('alpha'), dayPlane(), rowY(10));
      const top = yOf('2026-11-07', latest);
      expect(shades()).toContainEqual({ top, height: DAY_HEIGHT - top });
      fireEvent.pointerUp(dayPlane(), { pointerId: 1, clientX: 400, clientY: rowY(10) });
      expect(shades()).toEqual([]);
    });

    test('a goal, which can run on without end, is shaded only before its earliest', () => {
      open(weekLines(now));
      // Dream can be pulled in as far as now, so today is shaded down to noon and no further.
      act(() => day('2026-11-06').click());
      hold(candidate('dream'), dayPlane(), rowY(14));
      expect(shades()).toEqual([{ top: 0, height: 12 * PX_PER_HOUR }]);
    });

    test('turning the plane to another day mid-drag shades that day instead', () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
      open(close());
      hold(candidate('alpha'), dayPlane(), rowY(10));
      expect(shades()).not.toContainEqual({ top: 0, height: DAY_HEIGHT });
      fireEvent.pointerMove(day('2026-11-08'), { pointerId: 1, buttons: 1, clientX: 400, clientY: 40 });
      act(() => {
        vi.advanceTimersByTime(500);
      });
      expect(day('2026-11-08')).toHaveAttribute('aria-pressed', 'true');
      // Alpha's latest falls on Saturday, so none of Sunday is in reach.
      expect(shades()).toEqual([{ top: 0, height: DAY_HEIGHT }]);
    });
  });
});

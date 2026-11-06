import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { reach } from '../model/arrive';
import { dayWith, defaultLength } from '../model/day';
import { addDays, dayOf } from '../model/days';
import { newId } from '../model/ids';
import { colorVar } from '../model/palette';
import { type Action, reduce } from '../model/reducer';
import type { Shape } from '../model/types';
import {
  type BlockView,
  blocksOn,
  candidates,
  clock,
  DAY_HEIGHT,
  dayLabel,
  hourLabel,
  MIN_BLOCK_PX,
  MIN_LENGTH,
  mondayOf,
  nowY,
  PX_PER_HOUR,
  snapAt,
  TIMES_AT_PX,
  weekDates,
  weekName,
  weeksBetween,
  yOf,
} from '../plane/week';
import { type Store, useWorld } from '../store/store';

interface WeekWindowProps {
  store: Store;
  /** The time the window is drawn at. */
  now: number;
  /** The clock a drop reads, so a block lands at the moment it is let go. */
  clock?: () => number;
}

/** Where a day opens when nothing on it says otherwise. */
const OPENS_AT_HOUR = 8;
/** How much of the day shows above the spot a day opens on, so it is not hard against the top. */
const OPEN_MARGIN = PX_PER_HOUR;
/** A mouse press becomes a drag once it moves this far; one that never does is a tap, and does nothing. */
const DRAG_PX = 4;
/** A finger must rest this long before it drags, so a quick swipe still scrolls the day. */
const TOUCH_REST_MS = 200;
/** A finger that moves this far before then is scrolling, not dragging. */
const TOUCH_SLOP_PX = 8;
/** Holding a drag over a day's button this long turns the plane to that day. */
const HOVER_MS = 500;
/** Within this far of the day plane's top or bottom edge, a drag scrolls it. */
const EDGE_PX = 48;
const EDGE_STEP_PX = 8;
const EDGE_TICK_MS = 16;

const HOURS = Array.from({ length: 24 }, (_, h) => h);

/** The stretch handle: the bottom third of a block, between 8 and 16 px tall. */
export function handlePx(height: number): number {
  return Math.min(16, Math.max(8, height / 3));
}

function fill(color: number | null, muted: boolean): string {
  return muted || color === null ? 'var(--muted)' : colorVar(color);
}

/** What the hand took hold of: a next stop to place, or a block to move or stretch. */
interface Grab {
  kind: 'place' | 'move' | 'stretch';
  stopId: string;
  color: number | null;
  shape: Shape;
  /** The block's length in seconds. */
  length: number;
  /** For a move, how far below the block's top the press went down, in px. */
  offset: number;
  /** For a stretch, when the block starts, in ms: it stays put. */
  start: number;
  pointerId: number;
  from: { x: number; y: number };
  touch: boolean;
  /** Whether the press has become a drag. */
  live: boolean;
  /** Where the pointer is now, and what is under it. */
  at: { x: number; y: number; under: Element | null };
  /** The ids a new day line takes, chosen once so every dry run agrees with the drop. */
  dayId: string;
  endId: string;
}

/** Where the dragged block would land. `off` means over the Next stops column: it would come off its day. */
interface Aim {
  date: string;
  end: number;
  length: number;
  refused: boolean;
  off: boolean;
}

type Hold = Pick<Grab, 'kind' | 'stopId' | 'color' | 'shape' | 'length' | 'offset' | 'start'>;

/** The window's own event: a press on a next stop or a block, handed to the drag that follows it. */
const GRAB_EVENT = 'week-grab';

/**
 * The week window: a calendar over the plane. A row of the calendar week's seven days, today
 * marked in red and the chosen one in ink; the next stop of each line, soonest first; and the
 * chosen day from midnight to midnight, its blocks being stops on that day's line, each ending
 * when its train pulls in. It opens on tomorrow.
 *
 * Dragging a next stop onto the day places it; dragging a block moves it, by its bottom edge
 * stretches it, and onto the Next stops column takes it off its day. Each drop is one step undo
 * takes back, and a drop the world refuses changes nothing.
 */
export function WeekWindow({ store, now, clock: read }: WeekWindowProps) {
  const world = useWorld(store);
  const today = dayOf(now);
  const [selected, setSelected] = useState(() => addDays(today, 1));
  const [monday, setMonday] = useState(() => mondayOf(addDays(today, 1)));
  const [grabbed, setGrabbed] = useState<{ grab: Grab; aim: Aim | null } | null>(null);
  const plane = useRef<HTMLDivElement>(null);
  const grab = useRef<Grab | null>(null);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const clockRef = useRef(read ?? (() => now));
  clockRef.current = read ?? (() => now);
  const blocks = blocksOn(world, selected, now);
  const next = candidates(world, now);
  const line = nowY(selected, now);

  // A day opens on now when it is today, else on its first block, else at eight in the morning.
  // A day turned to in the middle of a drag keeps the hand's place instead.
  useLayoutEffect(() => {
    const el = plane.current;
    if (!el || grab.current?.live) return;
    const first = blocks.length ? Math.min(...blocks.map((b) => b.top)) : OPENS_AT_HOUR * PX_PER_HOUR;
    el.scrollTop = Math.max(0, (line ?? first) - OPEN_MARGIN);
  }, [selected]);

  // The drag is followed on the window, so it carries on wherever the pointer goes.
  useEffect(() => {
    let rest: number | null = null;
    let hover: { date: string; timer: number } | null = null;
    let edge: number | null = null;

    const clearHover = () => {
      if (hover) window.clearTimeout(hover.timer);
      hover = null;
    };
    const stopEdge = () => {
      if (edge !== null) window.clearInterval(edge);
      edge = null;
    };
    const finish = () => {
      if (rest !== null) window.clearTimeout(rest);
      rest = null;
      clearHover();
      stopEdge();
      grab.current = null;
      setGrabbed(null);
    };

    /** The action a drop at this aim dispatches. A block dropped on another day is placed there. */
    const actionFor = (g: Grab, aim: Aim, t: number): Action => {
      if (aim.off) return { type: 'unplace', stopId: g.stopId, now: t };
      const home = dayWith(store.getState(), g.stopId)?.day?.date;
      return g.kind === 'place' || home !== aim.date
        ? { type: 'place', stopId: g.stopId, date: aim.date, end: aim.end, length: aim.length, now: t, dayId: g.dayId, endId: g.endId }
        : { type: 'moveBlock', stopId: g.stopId, end: aim.end, length: aim.length, now: t };
    };

    /**
     * Where the block lands for the pointer where it is: snapped to the quarter hour, its end kept
     * within the line's reach. A dry run of the drop says whether the world would take it.
     */
    const aimAt = (g: Grab): Aim | null => {
      const { under, y } = g.at;
      const w = store.getState();
      const t = clockRef.current();
      const date = selectedRef.current;
      if (g.kind !== 'place' && under?.closest('.week-column')) return { date, end: 0, length: g.length, refused: false, off: true };
      const el = plane.current;
      if (!el || !under?.closest('.week-plane')) return null;
      const py = y - el.getBoundingClientRect().top + el.scrollTop;
      let end =
        g.kind === 'stretch'
          ? Math.max(snapAt(date, py), g.start + MIN_LENGTH * 1000)
          : snapAt(date, py - g.offset) + g.length * 1000;
      const r = reach(w, g.stopId, t);
      if (r) end = Math.min(Math.max(end, r.earliest), r.latest ?? Infinity);
      const length = g.kind === 'stretch' ? Math.max(MIN_LENGTH, Math.round((end - g.start) / 1000)) : g.length;
      const aim: Aim = { date, end, length, refused: false, off: false };
      return { ...aim, refused: reduce(w, actionFor(g, aim, t)) === w };
    };

    const show = () => {
      const g = grab.current;
      if (g?.live) setGrabbed({ grab: g, aim: aimAt(g) });
    };

    /** Near the day plane's top or bottom edge, the plane scrolls under the held block. */
    const followEdge = (g: Grab) => {
      const el = plane.current;
      if (!el || !g.at.under?.closest('.week-plane')) return stopEdge();
      const box = el.getBoundingClientRect();
      const dir = g.at.y < box.top + EDGE_PX ? -1 : g.at.y > box.bottom - EDGE_PX ? 1 : 0;
      if (dir === 0 || box.height <= 2 * EDGE_PX) return stopEdge();
      if (edge !== null) return;
      edge = window.setInterval(() => {
        el.scrollTop += dir * EDGE_STEP_PX;
        show();
      }, EDGE_TICK_MS);
    };

    /** Held over a day's button, the plane turns to that day after a moment. A stretch stays on its day. */
    const followDays = (g: Grab) => {
      const date = g.kind === 'stretch' ? undefined : g.at.under?.closest<HTMLElement>('[data-week-day]')?.dataset.weekDay;
      if (!date) return clearHover();
      if (hover?.date === date) return;
      clearHover();
      hover = {
        date,
        timer: window.setTimeout(() => {
          selectedRef.current = date;
          setSelected(date);
          show();
        }, HOVER_MS),
      };
    };

    const onMove = (e: PointerEvent) => {
      const g = grab.current;
      if (!g || e.pointerId !== g.pointerId) return;
      // What is under the pointer is read from its place, since a finger's events may stay with what it pressed.
      const under = document.elementFromPoint?.(e.clientX, e.clientY) ?? (e.target as Element | null);
      g.at = { x: e.clientX, y: e.clientY, under };
      if (!g.live) {
        const moved = Math.hypot(e.clientX - g.from.x, e.clientY - g.from.y);
        if (g.touch) {
          if (moved > TOUCH_SLOP_PX) finish();
          return;
        }
        if (moved < DRAG_PX) return;
        g.live = true;
      }
      followDays(g);
      followEdge(g);
      show();
    };

    const onUp = (e: PointerEvent) => {
      const g = grab.current;
      if (!g || e.pointerId !== g.pointerId) return;
      const aim = g.live ? aimAt(g) : null;
      finish();
      if (!aim || aim.refused) return;
      // One drop is one step. A refused one changes nothing, so nothing is recorded, and the step
      // before it is still the one undo takes back.
      store.begin();
      store.dispatch(actionFor(g, aim, clockRef.current()));
      store.end();
    };

    const onCancel = (e: PointerEvent) => {
      if (grab.current && e.pointerId === grab.current.pointerId) finish();
    };

    // Once a finger's drag is live, it is the drag's: the day must not scroll under it.
    const onTouchMove = (e: TouchEvent) => {
      if (grab.current?.live) e.preventDefault();
    };

    const onGrab = (e: Event) => {
      const g = (e as CustomEvent<Grab>).detail;
      finish();
      grab.current = g;
      if (g.touch) {
        rest = window.setTimeout(() => {
          rest = null;
          g.live = true;
          show();
        }, TOUCH_REST_MS);
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener(GRAB_EVENT, onGrab);
    return () => {
      finish();
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener(GRAB_EVENT, onGrab);
    };
  }, [store]);

  /** A press on a next stop or a block takes hold of it; it becomes a drag once it moves, or for a finger once it rests. */
  const press = (e: ReactPointerEvent, hold: Hold) => {
    if (e.button !== 0) return;
    const touch = e.pointerType === 'touch';
    // A finger's pointer is captured by what it pressed; let it go, so the drag reads what is under it.
    if (touch) (e.target as Element).releasePointerCapture?.(e.pointerId);
    const g: Grab = {
      ...hold,
      pointerId: e.pointerId,
      from: { x: e.clientX, y: e.clientY },
      touch,
      live: false,
      at: { x: e.clientX, y: e.clientY, under: e.target as Element },
      dayId: newId(),
      endId: newId(),
    };
    window.dispatchEvent(new CustomEvent(GRAB_EVENT, { detail: g }));
  };

  /** Where a press went down, in the day plane's own px from midnight. */
  const planeY = (e: ReactPointerEvent) => {
    const el = plane.current!;
    return e.clientY - el.getBoundingClientRect().top + el.scrollTop;
  };

  const step = (weeks: number) => {
    setMonday((m) => addDays(m, 7 * weeks));
    setSelected((d) => addDays(d, 7 * weeks));
  };

  const live = grabbed?.grab.live ? grabbed : null;
  const aim = live?.aim ?? null;
  const ghostTop = live && aim && !aim.off && aim.date === selected ? yOf(selected, aim.end - aim.length * 1000) : null;

  return (
    <section className="week" role="dialog" aria-label="Week">
      <h2 className="week-name">{weekName(weeksBetween(mondayOf(today), monday))}</h2>
      <div className="week-row">
        <button type="button" className="week-arrow" aria-label="Previous week" onClick={() => step(-1)}>
          <svg aria-hidden="true" width="12" height="16" viewBox="0 0 12 16">
            <path d="M9 2L3 8l6 6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        {weekDates(monday).map((date) => (
          <button
            key={date}
            type="button"
            className={['week-day', date === today && 'today', date < today && 'past'].filter(Boolean).join(' ')}
            data-week-day={date}
            aria-pressed={date === selected}
            aria-current={date === today ? 'date' : undefined}
            onClick={() => setSelected(date)}
          >
            {dayLabel(date)}
          </button>
        ))}
        <button type="button" className="week-arrow" aria-label="Next week" onClick={() => step(1)}>
          <svg aria-hidden="true" width="12" height="16" viewBox="0 0 12 16">
            <path d="M3 2l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
      <div className="week-body">
        <div className={aim?.off ? 'week-column taking' : 'week-column'} aria-label="Next stops">
          <h3 className="week-heading">Next stops</h3>
          <ul>
            {next.map((c) => (
              <li
                key={c.stopId}
                className={c.sketch ? 'candidate sketch' : 'candidate'}
                data-candidate={c.stopId}
                onPointerDown={(e) => {
                  const stop = world.stops.find((s) => s.id === c.stopId);
                  if (stop) press(e, { kind: 'place', stopId: c.stopId, color: c.color, shape: c.shape, length: defaultLength(stop), offset: 0, start: 0 });
                }}
              >
                <span
                  aria-hidden="true"
                  className={`shape ${c.shape} small`}
                  style={{ background: c.sketch ? 'var(--muted)' : colorVar(c.color) }}
                />
                <span className={c.sketch || c.shape === 'square' ? 'goal-name' : undefined}>{c.title || 'Unnamed'}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="week-plane" ref={plane} aria-label="Day plane">
          <div className="week-hours" style={{ height: DAY_HEIGHT }}>
            {HOURS.map((h) => (
              <div key={h} className="week-hour" style={{ top: h * PX_PER_HOUR }}>
                {h > 0 && <span>{hourLabel(h)}</span>}
              </div>
            ))}
            <div className="week-blocks">
              {blocks.map((b) => (
                <Block
                  key={b.stopId}
                  block={b}
                  lifted={live?.grab.stopId === b.stopId}
                  onPress={(e, stretch) =>
                    press(e, {
                      kind: stretch ? 'stretch' : 'move',
                      stopId: b.stopId,
                      color: b.color,
                      shape: b.shape,
                      length: b.length,
                      offset: planeY(e) - b.top,
                      start: b.start,
                    })
                  }
                />
              ))}
              {live && aim && ghostTop !== null && (
                <Ghost grab={live.grab} aim={aim} top={ghostTop} bottom={yOf(selected, aim.end)} />
              )}
            </div>
            {line !== null && <div className="week-now" style={{ top: line }} aria-hidden="true" />}
          </div>
        </div>
      </div>
    </section>
  );
}

interface BlockProps {
  block: BlockView;
  /** Being dragged: the ghost stands in for it until the drop. */
  lifted: boolean;
  onPress: (e: ReactPointerEvent, stretch: boolean) => void;
}

/** A stop on the day: its line's colour, its glyph and name, and its times when there is room. A done one is muted and stays put. */
function Block({ block: b, lifted, onPress }: BlockProps) {
  return (
    <div
      className={['week-block', b.done && 'done', lifted && 'lifted', b.clippedTop && 'clipped-top', b.clippedBottom && 'clipped-bottom']
        .filter(Boolean)
        .join(' ')}
      data-block={b.stopId}
      style={{
        top: b.top,
        height: b.height,
        left: `${(b.lane / b.lanes) * 100}%`,
        width: `${100 / b.lanes}%`,
        background: fill(b.color, b.done),
      }}
      onPointerDown={b.done ? undefined : (e) => onPress(e, false)}
    >
      <span aria-hidden="true" className={b.done ? 'shape dot' : `shape ${b.shape} small`} />
      <span className="week-block-text">
        <span className={b.shape === 'square' ? 'goal-name' : undefined}>{b.title || 'Unnamed'}</span>
        {b.height >= TIMES_AT_PX && (
          <span className="week-times">
            {clock(b.start)} – {clock(b.end)}
          </span>
        )}
      </span>
      {!b.done && (
        <div
          className="week-handle"
          data-handle={b.stopId}
          style={{ height: handlePx(b.height) }}
          onPointerDown={(e) => {
            e.stopPropagation();
            onPress(e, true);
          }}
        />
      )}
    </div>
  );
}

/** Where the held block would land, snapped; muted when the world would refuse the drop. */
function Ghost({ grab, aim, top, bottom }: { grab: Grab; aim: Aim; top: number; bottom: number }) {
  const height = Math.max(MIN_BLOCK_PX, bottom - top);
  return (
    <div
      className={aim.refused ? 'week-block week-ghost refused' : 'week-block week-ghost'}
      style={{ top, height, left: 0, width: '100%', background: fill(grab.color, aim.refused) }}
      aria-hidden="true"
    >
      <span className={`shape ${grab.shape} small`} />
      {height >= TIMES_AT_PX && (
        <span className="week-block-text">
          {clock(aim.end - aim.length * 1000)} – {clock(aim.end)}
        </span>
      )}
    </div>
  );
}

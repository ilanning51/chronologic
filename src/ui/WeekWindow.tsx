import { useLayoutEffect, useRef, useState } from 'react';
import { addDays, dayOf } from '../model/days';
import { colorVar } from '../model/palette';
import type { World } from '../model/types';
import {
  type BlockView,
  blocksOn,
  candidates,
  clock,
  DAY_HEIGHT,
  dayLabel,
  hourLabel,
  mondayOf,
  nowY,
  PX_PER_HOUR,
  TIMES_AT_PX,
  weekDates,
  weekName,
  weeksBetween,
} from '../plane/week';

interface WeekWindowProps {
  world: World;
  now: number;
}

/** Where a day opens when nothing on it says otherwise. */
const OPENS_AT_HOUR = 8;
/** How much of the day shows above the spot a day opens on, so it is not hard against the top. */
const OPEN_MARGIN = PX_PER_HOUR;

const HOURS = Array.from({ length: 24 }, (_, h) => h);

function fillOf(block: BlockView): string {
  return block.done || block.color === null ? 'var(--muted)' : colorVar(block.color);
}

/**
 * The week window: a calendar over the plane. A row of the calendar week's seven days, today
 * marked in red and the chosen one in ink; the next stop of each line, soonest first; and the
 * chosen day from midnight to midnight, its blocks being stops on that day's line, each ending
 * when its train pulls in. It opens on tomorrow.
 */
export function WeekWindow({ world, now }: WeekWindowProps) {
  const today = dayOf(now);
  const [selected, setSelected] = useState(() => addDays(today, 1));
  const [monday, setMonday] = useState(() => mondayOf(addDays(today, 1)));
  const plane = useRef<HTMLDivElement>(null);
  const blocks = blocksOn(world, selected, now);
  const next = candidates(world, now);
  const line = nowY(selected, now);

  // A day opens on now when it is today, else on its first block, else at eight in the morning.
  useLayoutEffect(() => {
    const el = plane.current;
    if (!el) return;
    const first = blocks.length ? Math.min(...blocks.map((b) => b.top)) : OPENS_AT_HOUR * PX_PER_HOUR;
    el.scrollTop = Math.max(0, (line ?? first) - OPEN_MARGIN);
    // Only a change of day moves the view; a block moving under the hand must not.
  }, [selected]);

  const step = (weeks: number) => {
    setMonday((m) => addDays(m, 7 * weeks));
    setSelected((d) => addDays(d, 7 * weeks));
  };

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
        <div className="week-column" aria-label="Next stops">
          <h3 className="week-heading">Next stops</h3>
          <ul>
            {next.map((c) => (
              <li key={c.stopId} className={c.sketch ? 'candidate sketch' : 'candidate'} data-candidate={c.stopId}>
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
                <div
                  key={b.stopId}
                  className={['week-block', b.done && 'done', b.clippedTop && 'clipped-top', b.clippedBottom && 'clipped-bottom']
                    .filter(Boolean)
                    .join(' ')}
                  data-block={b.stopId}
                  style={{
                    top: b.top,
                    height: b.height,
                    left: `${(b.lane / b.lanes) * 100}%`,
                    width: `${100 / b.lanes}%`,
                    background: fillOf(b),
                  }}
                >
                  <span aria-hidden="true" className={`shape ${b.shape} small`} />
                  <span className="week-block-text">
                    <span className={b.shape === 'square' ? 'goal-name' : undefined}>{b.title || 'Unnamed'}</span>
                    {b.height >= TIMES_AT_PX && (
                      <span className="week-times">
                        {clock(b.start)} – {clock(b.end)}
                      </span>
                    )}
                  </span>
                </div>
              ))}
            </div>
            {line !== null && <div className="week-now" style={{ top: line }} aria-hidden="true" />}
          </div>
        </div>
      </div>
    </section>
  );
}

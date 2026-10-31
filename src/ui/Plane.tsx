import { type PointerEvent as ReactPointerEvent, type ReactNode, useEffect, useMemo, useRef } from 'react';
import type { Point } from '../plane/geometry';
import { type Gesture, Recognizer, type Sample, type Target } from '../plane/gestures';

interface PlaneProps {
  onGesture: (gesture: Gesture) => void;
  onZoom: (at: Point, factor: number) => void;
  hud: ReactNode;
  children: ReactNode;
}

/** How often the recognizer is told that time passed while a pointer is down. */
const TICK_MS = 50;

/** Reads what a pointer went down on from the nearest data-target. */
function targetOf(el: EventTarget | null): Target {
  const hit = el instanceof Element ? el.closest<HTMLElement>('[data-target]') : null;
  if (!hit) return { kind: 'paper' };
  switch (hit.dataset.target) {
    case 'stop':
      return {
        kind: 'stop',
        id: hit.dataset.id ?? '',
        track: hit.dataset.track ?? '',
        goal: hit.dataset.goal !== undefined,
      };
    case 'train':
      return { kind: 'train', track: hit.dataset.track ?? '' };
    case 'bubble':
      return { kind: 'bubble', track: hit.dataset.track ?? '' };
    case 'tile': {
      const tile = hit.dataset.tile;
      return { kind: 'tile', tile: tile === 'triangle' || tile === 'line' ? tile : 'circle' };
    }
    case 'hold':
      return { kind: 'hold', id: hit.dataset.id ?? '' };
    default:
      return { kind: 'hud' };
  }
}

const sample = (e: ReactPointerEvent): Sample => ({ id: e.pointerId, x: e.clientX, y: e.clientY, t: Date.now() });

/**
 * The full-screen paper. It turns pointer events into samples for the recognizer and
 * draws the world layer in screen space (no transform), with the HUD on top in screen space.
 */
export function Plane({ onGesture, onZoom, hud, children }: PlaneProps) {
  const latest = useRef(onGesture);
  latest.current = onGesture;
  const recognizer = useMemo(() => new Recognizer((g) => latest.current(g)), []);
  const main = useRef<HTMLElement>(null);
  const ticker = useRef<number | null>(null);
  const pointersDown = useRef(0);

  const startTicking = () => {
    if (ticker.current === null) {
      ticker.current = window.setInterval(() => recognizer.tick(Date.now()), TICK_MS);
    }
  };
  const stopTickingWhenIdle = () => {
    if (pointersDown.current === 0 && ticker.current !== null) {
      window.clearInterval(ticker.current);
      ticker.current = null;
    }
  };

  useEffect(() => {
    const el = main.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      onZoom({ x: e.clientX, y: e.clientY }, Math.exp(-e.deltaY / 500));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [onZoom]);

  useEffect(
    () => () => {
      if (ticker.current !== null) window.clearInterval(ticker.current);
    },
    [],
  );

  return (
    <main
      ref={main}
      className="plane"
      aria-label="The plane"
      onPointerDown={(e) => {
        pointersDown.current += 1;
        recognizer.down(sample(e), targetOf(e.target));
        startTicking();
      }}
      onPointerMove={(e) => recognizer.move(sample(e))}
      onPointerUp={(e) => {
        pointersDown.current = Math.max(0, pointersDown.current - 1);
        recognizer.up(sample(e));
        stopTickingWhenIdle();
      }}
      onPointerCancel={(e) => {
        pointersDown.current = Math.max(0, pointersDown.current - 1);
        recognizer.cancel(e.pointerId);
        stopTickingWhenIdle();
      }}
    >
      <div className="world">
        {children}
      </div>
      {hud}
    </main>
  );
}

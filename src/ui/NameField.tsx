import { type KeyboardEvent, useEffect, useLayoutEffect, useRef, useState } from 'react';

interface NameFieldProps {
  x: number;
  y: number;
  /** The window, which the field always stays wholly inside. */
  viewport: { w: number; h: number };
  label: string;
  onCommit: (title: string) => void;
  onCancel: () => void;
}

/**
 * A one line field beside a new shape. Return commits what was typed (nothing is allowed),
 * Escape cancels, and walking away commits. It acts once, whichever of the three comes first.
 * Walking away includes the field being taken off the screen: a touchscreen may replace or
 * remove it before the browser ever blurs it, and what was typed is kept all the same.
 * It sits at (x, y) unless that would put any of it off the window; then it is pulled back on.
 */
export function NameField({ x, y, viewport, label, onCommit, onCancel }: NameFieldProps) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = box.current;
    if (el && (el.offsetWidth !== size.w || el.offsetHeight !== size.h)) setSize({ w: el.offsetWidth, h: el.offsetHeight });
  });
  const left = Math.max(0, Math.min(x, viewport.w - size.w));
  const top = Math.max(0, Math.min(y, viewport.h - size.h));
  const done = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const latest = useRef(onCommit);
  latest.current = onCommit;
  const finish = (act: () => void) => {
    if (done.current) return;
    done.current = true;
    act();
  };

  // Focused by hand rather than autoFocus: a browser scrolls even an overflow-hidden plane to
  // show a focused field, and on its first paint the field may still hang off the edge.
  useEffect(() => {
    input.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const el = input.current;
    return () => {
      // Strict mode runs this once while the field stays on the page; only a real removal commits.
      if (!el || el.isConnected || done.current) return;
      done.current = true;
      latest.current(el.value.trim());
    };
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      finish(() => onCommit(e.currentTarget.value.trim()));
    } else if (e.key === 'Escape') {
      e.preventDefault();
      finish(onCancel);
    }
  };
  return (
    <div ref={box} className="name-field" data-target="hud" style={{ left, top }}>
      <input
        ref={input}
        type="text"
        aria-label={label}
        autoComplete="off"
        enterKeyHint="done"
        onKeyDown={onKeyDown}
        onBlur={(e) => finish(() => onCommit(e.currentTarget.value.trim()))}
      />
    </div>
  );
}

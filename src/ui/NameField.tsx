import { type KeyboardEvent, useEffect, useRef } from 'react';

interface NameFieldProps {
  x: number;
  y: number;
  label: string;
  onCommit: (title: string) => void;
  onCancel: () => void;
}

/**
 * A one line field beside a new shape. Return commits what was typed (nothing is allowed),
 * Escape cancels, and walking away commits. It acts once, whichever of the three comes first.
 * Walking away includes the field being taken off the screen: a touchscreen may replace or
 * remove it before the browser ever blurs it, and what was typed is kept all the same.
 */
export function NameField({ x, y, label, onCommit, onCancel }: NameFieldProps) {
  const done = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const latest = useRef(onCommit);
  latest.current = onCommit;
  const finish = (act: () => void) => {
    if (done.current) return;
    done.current = true;
    act();
  };

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
    <div className="name-field" data-target="hud" style={{ left: x, top: y }}>
      <input
        ref={input}
        type="text"
        aria-label={label}
        autoFocus
        autoComplete="off"
        enterKeyHint="done"
        onKeyDown={onKeyDown}
        onBlur={(e) => finish(() => onCommit(e.currentTarget.value.trim()))}
      />
    </div>
  );
}

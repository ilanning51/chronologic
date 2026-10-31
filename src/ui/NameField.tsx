import { type KeyboardEvent, useRef } from 'react';

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
 */
export function NameField({ x, y, label, onCommit, onCancel }: NameFieldProps) {
  const done = useRef(false);
  const finish = (act: () => void) => {
    if (done.current) return;
    done.current = true;
    act();
  };
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

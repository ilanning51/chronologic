import { type KeyboardEvent, useEffect, useRef, useState } from 'react';
import type { Shape } from '../model/types';

interface CaptureFieldProps {
  onAdd: (title: string, shape: Shape) => void;
}

/**
 * The add button, a solid ink disc with a plus, which opens in place into the capture
 * pill: a one line field with the three shapes beside it. Type a title, tap a shape.
 * This is the one tap and a few words of the friction rule.
 */
export function CaptureField({ onAdd }: CaptureFieldProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  const close = () => {
    setTitle('');
    setOpen(false);
  };

  const add = (shape: Shape) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    onAdd(trimmed, shape);
    close();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      add('circle');
    } else if (e.key === 'Escape') {
      close();
    }
  };

  if (!open) {
    return (
      <button type="button" className="hud-add" aria-label="Add a station" onClick={() => setOpen(true)}>
        <svg aria-hidden="true" width="22" height="22" viewBox="0 0 22 22">
          <path d="M11 2v18M2 11h18" style={{ stroke: 'var(--paper)' }} strokeWidth="3.5" strokeLinecap="round" fill="none" />
        </svg>
      </button>
    );
  }

  return (
    <div className="hud-capture" role="group" aria-label="New station">
      <input
        ref={input}
        type="text"
        aria-label="Station title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={onKeyDown}
        autoComplete="off"
        enterKeyHint="done"
      />
      <button type="button" className="shape-button" aria-label="Add as a small station" onClick={() => add('circle')}>
        <span aria-hidden="true" className="shape circle" />
      </button>
      <button type="button" className="shape-button" aria-label="Add as a medium station" onClick={() => add('triangle')}>
        <span aria-hidden="true" className="shape triangle" />
      </button>
      <button type="button" className="shape-button" aria-label="Add as a large station" onClick={() => add('square')}>
        <span aria-hidden="true" className="shape square" />
      </button>
    </div>
  );
}

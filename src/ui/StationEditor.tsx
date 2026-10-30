import { type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { SPLIT_PIECES } from '../model/slide';
import type { Shape, Station } from '../model/types';

interface StationEditorProps {
  station: Station;
  onEdit: (change: { title?: string; shape?: Shape }) => void;
  onSplit: () => void;
  onDelete: () => void;
  onClose: () => void;
}

const SHAPES: { shape: Shape; label: string }[] = [
  { shape: 'circle', label: 'Small' },
  { shape: 'triangle', label: 'Medium' },
  { shape: 'square', label: 'Large' },
];

/**
 * Opens on a long press: title, shape, split into circles, delete. An ink pill in the
 * HUD, as a sheet or a dialog would be a form on the way to doing the thing.
 */
export function StationEditor({ station, onEdit, onSplit, onDelete, onClose }: StationEditorProps) {
  const [title, setTitle] = useState(station.title);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const pieces = SPLIT_PIECES[station.shape];

  useEffect(() => {
    input.current?.focus();
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div className="hud-editor" role="group" aria-label="Edit station">
      <input
        ref={input}
        type="text"
        aria-label="Station title"
        value={title}
        onChange={(e) => {
          setTitle(e.target.value);
          onEdit({ title: e.target.value });
        }}
        onKeyDown={onKeyDown}
        autoComplete="off"
        enterKeyHint="done"
      />
      {SHAPES.map(({ shape, label }) => (
        <button
          key={shape}
          type="button"
          className="shape-button"
          aria-label={label}
          aria-pressed={station.shape === shape}
          onClick={() => onEdit({ shape })}
        >
          <span aria-hidden="true" className={`shape ${shape}`} />
        </button>
      ))}
      {pieces > 1 && (
        <button type="button" className="pill-text" onClick={onSplit}>
          Split into {pieces} circles
        </button>
      )}
      <button type="button" className="pill-text" onClick={() => (deleteArmed ? onDelete() : setDeleteArmed(true))}>
        {deleteArmed ? 'Delete, tap again' : 'Delete'}
      </button>
    </div>
  );
}

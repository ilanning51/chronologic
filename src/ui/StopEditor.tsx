import { type KeyboardEvent, useEffect, useRef, useState } from 'react';
import type { Size, Stop } from '../model/types';

interface StopEditorProps {
  stop: Stop;
  /** Whether this stop is its track's goal, the only dot that can delete the line. */
  goal: boolean;
  done: boolean;
  /** True while a finger is holding the delete button; the fill shrinks while it does. */
  holding: boolean;
  onEdit: (change: { title?: string; shape?: 'circle' | 'triangle'; size?: Size }) => void;
  onDelete: () => void;
  onUndo: () => void;
  onClose: () => void;
}

/**
 * Opens on a long press, as an ink pill in the HUD. On a done dot it offers "Not done" and,
 * on the goal, a hold-to-delete that removes the line. A pending stop gets its title field;
 * the shape and size controls arrive with the edit half.
 */
export function StopEditor({ stop, goal, done, holding, onEdit, onUndo, onClose }: StopEditorProps) {
  const [title, setTitle] = useState(stop.title);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!done) input.current?.focus();
  }, [done]);

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  if (done) {
    return (
      <div className="hud-editor" data-target="hud" role="group" aria-label="Done stop">
        <button type="button" className="pill-text" aria-label="Not done" onClick={onUndo}>
          Not done
        </button>
        {goal && (
          <button
            type="button"
            className={holding ? 'pill-text hold holding' : 'pill-text hold'}
            data-target="hold"
            data-id="delete"
            aria-label="Hold to delete the line"
          >
            Hold to delete
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="hud-editor" data-target="hud" role="group" aria-label="Edit stop">
      <input
        ref={input}
        type="text"
        aria-label="Stop title"
        value={title}
        onChange={(e) => {
          setTitle(e.target.value);
          onEdit({ title: e.target.value });
        }}
        onKeyDown={onKeyDown}
        autoComplete="off"
        enterKeyHint="done"
      />
    </div>
  );
}

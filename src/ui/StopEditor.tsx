import { type CSSProperties, type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { colorVar } from '../model/palette';
import type { Size, Stop } from '../model/types';

interface StopEditorProps {
  stop: Stop;
  /** Whether this stop is its track's goal, the only dot that can delete the line. */
  goal: boolean;
  done: boolean;
  /** True while a finger is holding the delete button; the fill shrinks while it does. */
  holding: boolean;
  /** The lines the stop can leave, `color` null for the day; empty when it is on only one. */
  lines: { trackId: string; color: number | null }[];
  onEdit: (change: { title?: string; shape?: 'circle' | 'triangle'; size?: Size }) => void;
  onDelete: () => void;
  onUndo: () => void;
  onClose: () => void;
  onLeave: (trackId: string) => void;
}

const SIZES: { size: Size; label: string }[] = [
  { size: 'small', label: 'Small' },
  { size: 'medium', label: 'Medium' },
  { size: 'large', label: 'Large' },
];

/**
 * The delete that must be held: the plane's recognizer watches it through its data attributes,
 * and the fill shrinks over the hold time while `holding` is set. Only a goal ever shows it.
 */
function HoldToDelete({ holding }: { holding: boolean }) {
  return (
    <button
      type="button"
      className={holding ? 'pill-text hold holding' : 'pill-text hold'}
      data-target="hold"
      data-id="delete"
      aria-label="Hold to delete the line"
    >
      Hold to delete
    </button>
  );
}

/**
 * Opens on a long press, as an ink pill in the HUD. On a done dot it offers "Not done" and,
 * on the goal, a hold-to-delete that removes the line. A pending stop gets its title field,
 * its shape (not the goal's) and size, a chip per line it can leave, and Delete: at once for a
 * stop, held for the goal.
 */
export function StopEditor({ stop, goal, done, holding, lines, onEdit, onDelete, onUndo, onClose, onLeave }: StopEditorProps) {
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
        {goal && <HoldToDelete holding={holding} />}
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
      {!goal &&
        (['circle', 'triangle'] as const).map((shape) => (
          <button
            key={shape}
            type="button"
            className="shape-button"
            aria-label={shape === 'circle' ? 'Step' : 'Sub-goal'}
            aria-pressed={stop.shape === shape}
            onClick={() => onEdit({ shape })}
          >
            <span aria-hidden="true" className={`shape ${shape} medium`} />
          </button>
        ))}
      {SIZES.map(({ size, label }) => (
        <button
          key={size}
          type="button"
          className="pill-text"
          aria-label={label}
          aria-pressed={stop.size === size}
          onClick={() => onEdit({ size })}
        >
          {label}
        </button>
      ))}
      {lines.length > 0 && (
        <div className="line-chips">
          {lines.map(({ trackId, color }) => (
            <button
              key={trackId}
              type="button"
              className="line-chip"
              aria-label="Leave line"
              data-track={trackId}
              style={{ '--track-color': color === null ? 'var(--ink)' : colorVar(color) } as CSSProperties}
              onClick={() => onLeave(trackId)}
            />
          ))}
        </div>
      )}
      {goal ? (
        <HoldToDelete holding={holding} />
      ) : (
        <button type="button" className="pill-text" aria-label="Delete" onClick={onDelete}>
          Delete
        </button>
      )}
    </div>
  );
}

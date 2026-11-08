import { type ChangeEvent, type CSSProperties, type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { colorVar } from '../model/palette';
import { formatSeconds, parseSeconds } from '../plane/grid';
import type { Size, Stop } from '../model/types';

interface StopEditorProps {
  stop: Stop;
  /** Whether this stop is its track's goal, the only dot that can delete the line. */
  goal: boolean;
  /** The day's-end square: untitled, shapeless, and its hold deletes the day. */
  dayEnd?: boolean;
  done: boolean;
  /** True while a finger is holding the delete button; the fill shrinks while it does. */
  holding: boolean;
  /**
   * The lines the stop can leave, `color` null for the day; empty when it is on only one. `name`
   * is the line's: its goal's title, or "today" for the day.
   */
  lines: { trackId: string; color: number | null; name: string }[];
  onEdit: (change: { title?: string; shape?: 'circle' | 'triangle'; size?: Size; image?: string | null }) => void;
  /** A picture for the goal was chosen from the device. */
  onPicture?: (file: File) => void;
  onDelete: () => void;
  onUndo: () => void;
  onClose: () => void;
  onLeave: (trackId: string) => void;
  /** Puts a project's goal on the life line where it stands; offered only where the life line takes it. */
  onJoinLife?: () => void;
  /**
   * A pending stop's times on the line whose train reaches it first: the leg into it, what that
   * leg comes after, and how long until the train gets there. `editable` when they can be typed.
   */
  times?: { leg: number; after: string; fromNow: number; editable: boolean };
  /** A leg typed into the leg field, in seconds. */
  onLeg?: (seconds: number) => void;
  /** A time typed into the from-now field, in seconds. */
  onArrival?: (seconds: number) => void;
}

const SIZES: { size: Size; label: string }[] = [
  { size: 'small', label: 'Small' },
  { size: 'medium', label: 'Medium' },
  { size: 'large', label: 'Large' },
];

/**
 * The delete that must be held: the plane's recognizer watches it through its data attributes,
 * and the fill shrinks over the hold time while `holding` is set. Only a goal or the day's-end
 * square ever shows it; `what` names the line it takes.
 */
function HoldToDelete({ holding, what }: { holding: boolean; what: 'line' | 'day' }) {
  return (
    <button
      type="button"
      className={holding ? 'pill-text hold holding' : 'pill-text hold'}
      data-target="hold"
      data-id="delete"
      aria-label={`Hold to delete the ${what}`}
    >
      Hold to delete
    </button>
  );
}

/** A time as the editor shows it: rounded, since the map gives back a hair under what was typed. */
function shown(seconds: number): string {
  return formatSeconds(Math.round(seconds));
}

/**
 * One typed time. While focused it keeps its own draft, so the clock's redraws never overwrite
 * what is being typed. Return or leaving the field commits only text that changed: a duration
 * goes up, anything else puts back what was shown. Return keeps the editor open; Escape puts the
 * field back and nothing else.
 */
function TimeField({ value, label, name, onCommit }: { value: string; label: string; name: string; onCommit?: (seconds: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  if (!onCommit) {
    return (
      <span className="editor-time">
        <span className="editor-time-value">{value}</span> <span className="editor-time-label">{label}</span>
      </span>
    );
  }
  const commit = () => {
    if (draft === null) return;
    const seconds = draft === value ? null : parseSeconds(draft);
    setDraft(null);
    if (seconds !== null) onCommit(seconds);
  };
  return (
    <label className="editor-time">
      <input
        type="text"
        className="editor-time-value"
        aria-label={name}
        value={draft ?? value}
        size={Math.max(4, (draft ?? value).length)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            setDraft(null);
          }
        }}
        autoComplete="off"
        enterKeyHint="done"
      />{' '}
      <span className="editor-time-label">{label}</span>
    </label>
  );
}

/** The stop's two times, on a plate of their own above the editor so the editor never grows wider. */
function Times({ times, onLeg, onArrival }: Pick<StopEditorProps, 'times' | 'onLeg' | 'onArrival'>) {
  if (!times) return null;
  const at = times.fromNow <= 0;
  return (
    <div className="editor-times" role="group" aria-label="Times">
      <TimeField
        value={shown(times.leg)}
        label={`after ${times.after}`}
        name={`Time after ${times.after}`}
        onCommit={times.editable ? onLeg : undefined}
      />
      <TimeField
        value={at ? 'now' : shown(times.fromNow)}
        label={at ? '' : 'from now'}
        name="Time from now"
        onCommit={times.editable && !at ? onArrival : undefined}
      />
    </div>
  );
}

/**
 * Opens on a long press, as an ink pill in the HUD. On a done dot it offers "Not done" and,
 * on the goal, a hold-to-delete that removes the line. A pending stop gets its title field,
 * its two times (the leg into it and how long until its train gets there, typed into where they
 * can be), its shape (not a square's: the goal, or a marker on the life line) and size, a chip per
 * line it can leave, and Delete: at once for a stop, held for the goal. The goal also takes a picture of what it is for, chosen from the
 * device, and lets it go again. The day's-end square has nothing to name or shape: only the hold,
 * which deletes the day, and "Not done" once it is done.
 */
export function StopEditor({
  stop,
  goal,
  dayEnd = false,
  done,
  holding,
  lines,
  onEdit,
  onPicture,
  onDelete,
  onUndo,
  onClose,
  onLeave,
  onJoinLife,
  times,
  onLeg,
  onArrival,
}: StopEditorProps) {
  const [title, setTitle] = useState(stop.title);
  const input = useRef<HTMLInputElement>(null);
  const file = useRef<HTMLInputElement>(null);

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const chosen = e.target.files?.[0];
    e.target.value = '';
    if (chosen) onPicture?.(chosen);
  };

  useEffect(() => {
    if (!done && !dayEnd) input.current?.focus();
  }, [done, dayEnd]);

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
        {(goal || dayEnd) && <HoldToDelete holding={holding} what={dayEnd ? 'day' : 'line'} />}
      </div>
    );
  }

  if (dayEnd) {
    return (
      <div className="hud-editor" data-target="hud" role="group" aria-label="Edit day's end">
        <HoldToDelete holding={holding} what="day" />
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
      <Times times={times} onLeg={onLeg} onArrival={onArrival} />
      {!goal &&
        stop.shape !== 'square' &&
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
      {(lines.length > 0 || onJoinLife) && (
        <div className="line-chips">
          {lines.map(({ trackId, color, name }) => (
            <button
              key={trackId}
              type="button"
              className="line-chip"
              aria-label={`Leave ${name}`}
              data-track={trackId}
              style={{ '--track-color': color === null ? 'var(--ink)' : colorVar(color) } as CSSProperties}
              onClick={() => onLeave(trackId)}
            />
          ))}
          {onJoinLife && (
            // Hollow where a line chip is filled: not on the life line yet. Once on, it is Leave Life.
            <button
              type="button"
              className="line-chip join"
              aria-label="Join Life"
              style={{ '--track-color': 'var(--ink)' } as CSSProperties}
              onClick={onJoinLife}
            />
          )}
        </div>
      )}
      {goal && (
        <>
          <button type="button" className="pill-text" aria-label="Picture" onClick={() => file.current?.click()}>
            Picture
          </button>
          <input ref={file} type="file" accept="image/*" aria-label="Choose a picture" className="file" onChange={onFile} />
          {stop.image !== undefined && (
            <button type="button" className="pill-text" aria-label="No picture" onClick={() => onEdit({ image: null })}>
              No picture
            </button>
          )}
        </>
      )}
      {goal ? (
        <HoldToDelete holding={holding} what="line" />
      ) : (
        <button type="button" className="pill-text" aria-label="Delete" onClick={onDelete}>
          Delete
        </button>
      )}
    </div>
  );
}

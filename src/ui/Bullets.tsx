import { KIND_ORDER, KINDS, kindVar } from '../model/kinds';
import { LENGTH_ORDER, LENGTH_WORDS } from '../model/sizes';
import type { Kind, Length } from '../model/types';

interface BulletsProps {
  /** The bullet last tapped, whose chips are showing, if any. */
  pendingKind: Kind | null;
  /** The length the next stretch will get: the chosen chip, or the last one used. */
  length: Length;
  onPickKind: (kind: Kind) => void;
  onPickLength: (length: Length) => void;
}

/**
 * The four kind bullets, each a solid disc in its color carrying its initial, and the
 * four length chips that appear beside them once a bullet is tapped. Drawing starts
 * with a drag from a bullet, which the plane's recognizer reports; a tap is a click.
 */
export function Bullets({ pendingKind, length, onPickKind, onPickLength }: BulletsProps) {
  return (
    <div className="hud-bullets">
      {KIND_ORDER.map((kind) => (
        <button
          key={kind}
          type="button"
          className="bullet"
          data-target="bullet"
          data-line={kind}
          aria-label={`${KINDS[kind].word} line. Starts a new stretch.`}
          aria-pressed={pendingKind === kind}
          onClick={() => onPickKind(kind)}
        >
          <span aria-hidden="true" className="disc" style={{ background: kindVar(kind) }}>
            {KINDS[kind].initial}
          </span>
        </button>
      ))}
      {pendingKind && (
        <div className="hud-chips" role="group" aria-label="How long">
          {LENGTH_ORDER.map((option) => (
            <button
              key={option}
              type="button"
              className="chip"
              aria-pressed={option === length}
              style={option === length ? { background: kindVar(pendingKind) } : undefined}
              onClick={() => onPickLength(option)}
            >
              {LENGTH_WORDS[option]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

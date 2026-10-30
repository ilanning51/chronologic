import { KIND_ORDER, KINDS, kindVar } from '../model/kinds';

/** The four kind bullets. Each is a solid disc in its color carrying its initial. */
export function Bullets() {
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
        >
          <span aria-hidden="true" className="disc" style={{ background: kindVar(kind) }}>
            {KINDS[kind].initial}
          </span>
        </button>
      ))}
    </div>
  );
}

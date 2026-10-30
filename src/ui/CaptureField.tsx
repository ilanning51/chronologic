/** The add button: a solid ink disc with a plus. It opens into the capture pill in a later task. */
export function CaptureField() {
  return (
    <button type="button" className="hud-add" aria-label="Add a station">
      <svg aria-hidden="true" width="22" height="22" viewBox="0 0 22 22">
        <path d="M11 2v18M2 11h18" style={{ stroke: 'var(--paper)' }} strokeWidth="3.5" strokeLinecap="round" fill="none" />
      </svg>
    </button>
  );
}

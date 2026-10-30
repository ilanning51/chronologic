/** Milliseconds of the one haptic the app ever makes, when the pie empties. */
const BUZZ_MS = 30;

/** Asks the phone for one short vibration. Phones without one, and browsers that refuse, are left alone. */
export function buzz(): void {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  try {
    navigator.vibrate(BUZZ_MS);
  } catch {
    // Not allowed here. Nothing to tell the person.
  }
}

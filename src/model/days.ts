/** The local hour a day turns over. Up past midnight still counts as the day before. */
export const DAY_TURNS_AT = 4;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * The local date, as YYYY-MM-DD, of the day that now falls in. A day runs from DAY_TURNS_AT
 * local to DAY_TURNS_AT local. Reads the local hour rather than subtracting a fixed span of
 * milliseconds, so a clock change in the small hours doesn't shift the turnover by an hour.
 */
export function dayOf(now: number): string {
  const t = new Date(now);
  const day = new Date(t.getFullYear(), t.getMonth(), t.getDate() - (t.getHours() < DAY_TURNS_AT ? 1 : 0));
  return `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
}

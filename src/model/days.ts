function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function dateOf(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parse(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * The local date, as YYYY-MM-DD, of the day that now falls in. A day runs from midnight to
 * midnight, the same rule on the map and in the week window.
 */
export function dayOf(now: number): string {
  return dateOf(new Date(now));
}

/** The moment, in ms, a date begins: its local midnight. */
export function startOfDate(date: string): number {
  return parse(date).getTime();
}

/** The next local midnight after now. Built from the date, so a clock change never shifts it by an hour. */
export function nextMidnight(now: number): number {
  const t = new Date(now);
  return new Date(t.getFullYear(), t.getMonth(), t.getDate() + 1).getTime();
}

/** The date n days after (or before, when n is negative) this one. */
export function addDays(date: string, n: number): string {
  const d = parse(date);
  return dateOf(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n));
}

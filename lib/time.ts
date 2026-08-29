/**
 * The walk happens in India, so its dates are Indian dates.
 *
 * Using the viewer's device clock meant a reader in London and a reader in
 * Delhi could see different expedition days around midnight, and "today" in the
 * admin panel could be yesterday on the road. Everything to do with which day
 * it is now uses Asia/Kolkata, which has no daylight saving and so needs no
 * special cases.
 */

export const WALK_TIMEZONE = "Asia/Kolkata";
/** India is UTC+5:30 all year round. */
const IST_OFFSET_MS = 5.5 * 3600000;

/** The date in India, as YYYY-MM-DD. */
export function istDayKey(date: Date | string = new Date()) {
  const value = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(value.getTime())) return istDayKey(new Date());
  return new Date(value.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** Midday in India on a given date, which is the safe anchor for day maths. */
export function istNoon(day: string) {
  return new Date(`${day}T12:00:00+05:30`);
}

/**
 * Whole days of walking, counting the first day as day 1, in Indian dates.
 * Returns 0 before the walk starts.
 */
export function walkDay(startDate: string, now: Date = new Date()) {
  const start = istNoon(istDayKey(`${startDate}T12:00:00+05:30`));
  const today = istNoon(istDayKey(now));
  if (Number.isNaN(start.getTime()) || Number.isNaN(today.getTime())) return 0;
  const days = Math.round((today.getTime() - start.getTime()) / 86400000) + 1;
  return days < 1 ? 0 : days;
}

/** A date shown the same way to every reader, wherever they are. */
export function formatWalkDate(date: Date | string) {
  const value = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(value.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit", month: "short", year: "numeric", timeZone: WALK_TIMEZONE,
  }).format(value);
}

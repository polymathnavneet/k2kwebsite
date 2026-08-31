import { istDayKey } from "@/lib/time";

/**
 * When he actually arrives, worked out from how he has actually been walking.
 *
 * The site already carried a finishing date, and it was the plan's date: 4,270
 * kilometres at the twenty-five a day he wrote down before he had walked any of
 * them. That number is a hope. After a fortnight on the road there is a real
 * one, and it is the only one worth printing - a man averaging nineteen a day
 * does not arrive when a spreadsheet written in August says he will.
 *
 * The rate is per *calendar* day, not per walking day, and that distinction is
 * the whole thing. Twenty-five kilometres on each of five days is not
 * twenty-five a day if he rested for two: the road does not care why he was
 * still, and an arrival date built on walking days alone would run weeks early.
 * Rest days, illness, a washed-out bridge and a day spent talking to a school
 * all land in the same divisor, because all of them are days he did not arrive.
 */

export type WalkedDay = { day: string; km: number };

export type Forecast = {
  /** Kilometres a day, counting the days he rested. */
  kmPerDay: number;
  /** How many calendar days that rate is drawn from. */
  basisDays: number;
  /** Whether there is enough walking behind it to be a prediction at all. */
  enough: boolean;
  /** Days from today, and the date, for the next town and for Srinagar. */
  toNext: { days: number; date: string } | null;
  toFinish: { days: number; date: string } | null;
  /**
   * Against the plan he set out with: negative is early, positive is late.
   * Null before there is a real rate to compare.
   */
  daysVsPlan: number | null;
  plannedFinish: string;
};

/**
 * Below this the rate is noise, not a pace, and dividing by it produces
 * arrival dates in the next century. One kilometre a day averaged over a
 * fortnight is not a walk in progress.
 */
export const MIN_RATE_KM = 1;

/** At least this many calendar days before a rate means anything. */
export const MIN_BASIS_DAYS = 3;

const DAY_MS = 86400000;

/** A date key n days after another, in India. */
export function addDays(dayKey: string, days: number) {
  return istDayKey(new Date(new Date(`${dayKey}T06:00:00+05:30`).getTime() + days * DAY_MS));
}

/**
 * The rate, per calendar day, over the span the walked days actually cover.
 *
 * Taking the span from his first walked day to today - rather than counting
 * only the days with kilometres on them - is what folds the rest days in.
 */
export function paceFrom(days: WalkedDay[], today = istDayKey()) {
  const walked = days.filter(entry => entry.km > 0).sort((a, b) => a.day.localeCompare(b.day));
  if (!walked.length) return { kmPerDay: 0, basisDays: 0 };

  const first = new Date(`${walked[0].day}T06:00:00+05:30`).getTime();
  const last = new Date(`${today}T06:00:00+05:30`).getTime();
  // Inclusive of both ends: one day of walking is a one-day span, not zero.
  const basisDays = Math.max(1, Math.round((last - first) / DAY_MS) + 1);
  const total = walked.reduce((sum, entry) => sum + entry.km, 0);

  return { kmPerDay: total / basisDays, basisDays };
}

export function forecast(input: {
  days: WalkedDay[];
  /** Kilometres from here to the next town on the route. */
  toNextKm: number | null;
  /** Kilometres from here to Srinagar. */
  toFinishKm: number;
  /** The pace he planned before he had walked any of it. */
  plannedKmPerDay: number;
  startDate: string;
  today?: string;
}): Forecast {
  const today = input.today ?? istDayKey();
  const { kmPerDay, basisDays } = paceFrom(input.days, today);
  const enough = basisDays >= MIN_BASIS_DAYS && kmPerDay >= MIN_RATE_KM;

  // The date the plan promised, kept alongside so the prediction can be read
  // against the thing it replaces.
  const plannedDays = Math.ceil(input.toFinishKm / Math.max(1, plannedCalendarRate(input.plannedKmPerDay)));
  const plannedFinish = addDays(today, plannedDays);

  if (!enough) {
    return {
      kmPerDay, basisDays, enough: false,
      toNext: null, toFinish: null, daysVsPlan: null, plannedFinish,
    };
  }

  const nextDays = input.toNextKm === null ? null : Math.max(0, Math.ceil(input.toNextKm / kmPerDay));
  const finishDays = Math.max(0, Math.ceil(input.toFinishKm / kmPerDay));

  return {
    kmPerDay, basisDays, enough: true,
    toNext: nextDays === null ? null : { days: nextDays, date: addDays(today, nextDays) },
    toFinish: { days: finishDays, date: addDays(today, finishDays) },
    daysVsPlan: finishDays - plannedDays,
    plannedFinish,
  };
}

/**
 * The planned rate expressed per calendar day.
 *
 * The plan is written as kilometres per *walking* day with a rest day a week,
 * so comparing it against a measured calendar rate without this conversion
 * would flatter the plan by a seventh and report him behind schedule on a day
 * he walked exactly what he meant to.
 */
export function plannedCalendarRate(plannedKmPerDay: number) {
  return (plannedKmPerDay * 6) / 7;
}

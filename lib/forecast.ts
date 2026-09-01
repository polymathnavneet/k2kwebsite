import { istDayKey } from "@/lib/time";

/**
 * When he actually arrives, worked out from how he has actually been walking.
 *
 * The site carried a finishing date worked out from the pace he set himself
 * before he had walked any of it. That is the best answer available until there
 * is walking to measure, and no answer at all once there is: a man averaging
 * nineteen a day does not arrive when a figure written in August says he will.
 *
 * What comes out is a date, not a mark. He chose the pace and he chose the
 * road, so nothing here compares the two and nothing here calls him late.
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
   * The date his own planned pace gives, used until there is walking to
   * measure. It is a starting figure, not a mark to be graded against: he set
   * that pace himself and is free to change it by walking.
   */
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

  // The date his own planned pace gives. It stands in until there is walking to
  // measure, and is not kept as something to be measured against afterwards.
  const plannedDays = Math.ceil(input.toFinishKm / Math.max(1, plannedCalendarRate(input.plannedKmPerDay)));
  const plannedFinish = addDays(today, plannedDays);

  if (!enough) {
    return {
      kmPerDay, basisDays, enough: false,
      toNext: null, toFinish: null, plannedFinish,
    };
  }

  const nextDays = input.toNextKm === null ? null : Math.max(0, Math.ceil(input.toNextKm / kmPerDay));
  const finishDays = Math.max(0, Math.ceil(input.toFinishKm / kmPerDay));

  return {
    kmPerDay, basisDays, enough: true,
    toNext: nextDays === null ? null : { days: nextDays, date: addDays(today, nextDays) },
    toFinish: { days: finishDays, date: addDays(today, finishDays) },
    plannedFinish,
  };
}

/**
 * The planned rate expressed per calendar day.
 *
 * He set the pace as kilometres per *walking* day with a rest day a week, so
 * using that figure directly as a calendar rate would overstate it by a seventh
 * and put the stand-in arrival date a fortnight too early.
 */
export function plannedCalendarRate(plannedKmPerDay: number) {
  return (plannedKmPerDay * 6) / 7;
}

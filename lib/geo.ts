import { walkDay } from "@/lib/time";

/** Distance in kilometres between two points on the earth. */
export function distanceKm(fromLat: number, fromLon: number, toLat: number, toLon: number) {
  const R = 6371;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(toLat - fromLat);
  const dLon = toRad(toLon - fromLon);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(fromLat)) * Math.cos(toRad(toLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Whole days from the start date to now, counting the first day as day 1.
 * Indian dates, so every reader sees the same expedition day.
 */
export function dayOfWalk(startDate: string, now = new Date()) {
  return walkDay(startDate, now);
}

/**
 * How many kilometres a week actually covers.
 *
 * A planned pace of 25 km/day is a walking-day figure, not a calendar-day one.
 * Treating it as seven days a week quietly promises a finish nobody can reach.
 * One rest day in seven is the working assumption.
 */
export const REST_DAYS_PER_WEEK = 1;
export const WALKING_DAYS_PER_WEEK = 7 - REST_DAYS_PER_WEEK;

/** Planned pace converted from a walking-day rate to a calendar-day rate. */
export function calendarPace(walkingDayPace: number) {
  return (walkingDayPace * WALKING_DAYS_PER_WEEK) / 7;
}

/**
 * The pace to project future arrivals with.
 *
 * Before the walk, and for the first couple of days when one long or short day
 * would skew everything, this is the planned pace. After that it is the pace
 * actually being walked.
 *
 * There is an upper bound but deliberately no lower one. A slow week is a real
 * thing that happens to a real person - illness, heat, a bad ankle - and the
 * arrival dates should tell the truth about it rather than quietly pretending
 * a minimum. The upper bound only stops a bad reading inventing a finish that
 * has not happened.
 */
export const MAX_CREDIBLE_PACE = 50;

export function livePace(distanceTotal: number, day: number, plannedPace: number) {
  if (day < 3 || distanceTotal <= 0) return plannedPace;
  const actual = distanceTotal / day;
  // A floor here would hide a slow week instead of reporting it.
  return Math.min(MAX_CREDIBLE_PACE, actual);
}

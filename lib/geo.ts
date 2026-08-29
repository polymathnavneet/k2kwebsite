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

/** Whole days from the start date to now, counting the first day as day 1. */
export function dayOfWalk(startDate: string, now = new Date()) {
  const start = new Date(`${startDate}T00:00:00`);
  if (Number.isNaN(start.getTime())) return 0;
  const days = Math.floor((now.getTime() - start.getTime()) / 86400000) + 1;
  return days < 1 ? 0 : days;
}

/**
 * The pace to project future arrivals with.
 *
 * Before the walk, and for the first couple of days when one long or short day
 * would skew everything, this is the planned pace. After that it is the pace
 * actually being walked, clamped to a believable range so a bad GPS reading
 * cannot throw the finish date into next year.
 */
export function livePace(distanceTotal: number, day: number, plannedPace: number) {
  if (day < 3 || distanceTotal <= 0) return plannedPace;
  const actual = distanceTotal / day;
  return Math.max(8, Math.min(50, actual));
}

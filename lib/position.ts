import type { Journey } from "@/lib/types";

/**
 * How far off the drawn line still counts as walking it.
 *
 * A route is a list of towns, not a kerb-accurate path, so the real road wanders
 * either side of it. Twelve kilometres is wide enough to allow that and narrow
 * enough that a genuine detour is noticed.
 *
 * It lives here rather than in lib/tracking.ts because the pages need it too,
 * and tracking.ts reaches for the database - importing it into a page would
 * drag the whole server side into the browser bundle.
 */
export const OFF_ROUTE_KM = 12;

/**
 * Is there a real position from the phone, or is this the placeholder?
 *
 * An untouched database answers with a stock row pointing at Lucknow. That is a
 * starting value, not a location, and a site that presents it as one is lying
 * to its readers.
 */
export function positioned(journey: Journey) {
  return Boolean(journey.updatedAt) && Number.isFinite(journey.lat) && Number.isFinite(journey.lon);
}

/**
 * Is that position near enough the route for progress along it to mean anything?
 *
 * This is the question the site used to skip. It asked instead whether the walk
 * had been switched to "live" in the admin panel - a flag somebody has to
 * remember to set - and then reported "next stop Nagercoil, 22 km" to a man
 * standing in Bihar, 200 km from the line. Distance and the next town now
 * follow the position itself, and go quiet when the position cannot support
 * them.
 */
export function onCourse(journey: Journey) {
  return positioned(journey) && (journey.offRouteKm ?? 0) <= OFF_ROUTE_KM;
}

import { nextStopAfter, projectOntoRoute } from "@/lib/route-math";
import type { Journey, RouteStop } from "@/lib/types";

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

/**
 * Where the walk is heading next, worked out from the GPS position itself.
 *
 * This used to go quiet whenever the position was more than OFF_ROUTE_KM from
 * the line, on the grounds that "next stop" could not be trusted. That was the
 * wrong call. Standing in Bettiah, 218 km east of the route, the position still
 * projects cleanly onto the line just past Varanasi, and the next town north is
 * Sultanpur - which is the answer somebody following a walk to Kashmir wants,
 * and is nothing like the "Nagercoil, 22 km" the old flag-based version gave.
 *
 * So it always answers, and reports how far off the line the answer was taken
 * from, rather than refusing to answer at all. The stored progress figure is
 * ignored: it is only written when GPS is processed, so it goes stale the
 * moment a position arrives by any other route.
 */
export function predictNext(stops: RouteStop[], journey: Journey) {
  if (!positioned(journey) || !Array.isArray(stops) || stops.length < 2) return null;
  const projected = projectOntoRoute(stops, journey.lat, journey.lon);
  if (!projected) return null;
  const next = nextStopAfter(stops, projected.alongKm);
  return {
    alongKm: projected.alongKm,
    offRouteKm: projected.offRouteKm,
    next: next ?? stops[stops.length - 1],
    toNextKm: Math.max(0, (next ?? stops[stops.length - 1]).km - projected.alongKm),
    // Far enough off the line that the answer deserves saying so out loud.
    strayed: projected.offRouteKm > OFF_ROUTE_KM,
  };
}

/**
 * How long ago the phone last said anything, and whether that is long enough
 * to change how the site should talk about it.
 *
 * This exists because the phone is deliberately about to go quiet. Reporting a
 * position all day is what drains the battery, so the tracker is set to speak
 * rarely and catch up at night - which means the last known position can
 * honestly be many hours old.
 *
 * A site that says "Navneet is in Lucknow" on top of a fix from breakfast is
 * not tracking him, it is guessing on his behalf. Past FRESH_HOURS the wording
 * moves to the past tense and the age is shown, so a reader can tell the
 * difference between where he is and where he was.
 */
export const FRESH_HOURS = 3;

export function lastHeard(journey: Journey, now = Date.now()) {
  if (!journey.updatedAt) return null;
  const at = new Date(journey.updatedAt).getTime();
  if (!Number.isFinite(at)) return null;

  const minutes = Math.max(0, Math.round((now - at) / 60000));
  return {
    minutes,
    fresh: minutes < FRESH_HOURS * 60,
    /** "22 minutes ago", "6 hours ago", "2 days ago". */
    phrase: minutes < 2 ? "just now"
      : minutes < 60 ? `${minutes} minutes ago`
      : minutes < 48 * 60 ? `${Math.round(minutes / 60)} hour${Math.round(minutes / 60) === 1 ? "" : "s"} ago`
      : `${Math.round(minutes / 1440)} days ago`,
  };
}

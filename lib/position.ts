import { nextStopAfter, projectOntoRoute } from "@/lib/route-math";
import type { Journey, RouteStop } from "@/lib/types";

/**
 * How far off the drawn line still counts as walking it.
 *
 * A route is a list of towns, not a kerb-accurate path, so the real road wanders
 * either side of it. Past twelve kilometres the drawn line has stopped
 * describing where he is walking, and the line is what gets corrected: the town
 * he is actually in joins the route. He is never "off" it.
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
 * Where the walk is heading next, worked out from the GPS position itself.
 *
 * This used to go quiet whenever the position was more than OFF_ROUTE_KM from
 * the line, on the grounds that "next stop" could not be trusted. That was the
 * wrong call. Standing in Bettiah, 218 km east of the route, the position still
 * projects cleanly onto the line just past Varanasi, and the next town north is
 * Sultanpur - which is the answer somebody following a walk to Kashmir wants,
 * and is nothing like the "Nagercoil, 22 km" the old flag-based version gave.
 *
 * So it always answers, and reports how far the drawn line sits from where he
 * really is, rather than refusing to answer at all. The stored progress figure is
 * ignored: it is only written when GPS is processed, so it goes stale the
 * moment a position arrives by any other route.
 */
export function predictNext(stops: RouteStop[], journey: Journey) {
  if (!positioned(journey) || !Array.isArray(stops) || stops.length < 2) return null;
  const projected = projectOntoRoute(stops, journey.lat, journey.lon);
  if (!projected) return null;
  let next = nextStopAfter(stops, projected.alongKm);

  // A projection can land a few kilometres before the centre point of the
  // town the phone is already in. That made Lucknow read "Next: Lucknow ·
  // 10 km". Reverse geocoding has already told us the current town, so when
  // that town and the projected next stop are the same, move on to the stop
  // after it. The GPS still decides where he is; this only stops the route
  // label contradicting it.
  const currentTown = journey.currentPlace.split(",")[0]?.trim().toLocaleLowerCase("en-IN") ?? "";
  if (next && currentTown && next.name.trim().toLocaleLowerCase("en-IN") === currentTown) {
    const currentIndex = stops.indexOf(next);
    next = stops.slice(currentIndex + 1).find(stop => stop.km > projected.alongKm) ?? null;
  }

  const destination = next ?? stops[stops.length - 1];
  return {
    alongKm: projected.alongKm,
    offRouteKm: projected.offRouteKm,
    next: destination,
    toNextKm: Math.max(0, destination.km - projected.alongKm),
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
export const FRESH_HOURS = 24;

export function lastHeard(journey: Journey, now = Date.now()) {
  if (!journey.updatedAt) return null;
  const at = new Date(journey.updatedAt).getTime();
  if (!Number.isFinite(at)) return null;

  const minutes = Math.max(0, Math.round((now - at) / 60000));
  return {
    minutes,
    fresh: minutes < FRESH_HOURS * 60,
    // Significant Changes mode is intentionally quiet while the phone has not
    // moved far enough. A few silent hours therefore means "watching", not
    // "broken". After a full day without a fix the wording becomes a warning.
    watching: minutes >= 30 && minutes < FRESH_HOURS * 60,
    /** "22 minutes ago", "6 hours ago", "2 days ago". */
    phrase: minutes < 2 ? "just now"
      : minutes < 60 ? `${minutes} minutes ago`
      : minutes < 48 * 60 ? `${Math.round(minutes / 60)} hour${Math.round(minutes / 60) === 1 ? "" : "s"} ago`
      : `${Math.round(minutes / 1440)} days ago`,
  };
}

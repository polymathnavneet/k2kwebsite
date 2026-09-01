import { env } from "cloudflare:workers";
import { getDb } from "@/db";
import { isAdmin } from "@/lib/server";
import { trackerHealth, trimAttempts } from "@/lib/tracker-log";

/**
 * GET /api/tracker -> why the phone is or is not reporting, and the exact
 * address to paste into the app so it can never be typed wrong again.
 *
 * Behind the admin passcode, because it hands back the tracking key. That key
 * can do exactly one thing - add a position - so it is the least dangerous
 * secret the site has, and there is no way to configure a tracker without
 * seeing it. Copying it by hand from a settings page is how it got wrong in the
 * first place; a URL that is already complete cannot be mistyped.
 */
export async function GET(request: Request) {
  if (!isAdmin(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  await trimAttempts(db);
  const health = await trackerHealth(db);

  const key = (env as unknown as { TRACK_KEY?: string }).TRACK_KEY?.trim() ?? "";
  const site = new URL(request.url).origin;

  return Response.json({
    ...health,
    // OwnTracks in HTTP mode wants one address and nothing else.
    ownTracksUrl: key ? `${site}/api/track?key=${encodeURIComponent(key)}` : "",
    // The same door, for any app that can only fire a plain web request on a
    // timer: Shortcuts on an iPhone, Tasker or MacroDroid on Android.
    plainUrl: key ? `${site}/api/track?key=${encodeURIComponent(key)}&lat=LAT&lon=LON` : "",
    configured: Boolean(key),
  }, { headers: { "cache-control": "no-store" } });
}

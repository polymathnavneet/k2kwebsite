import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { journey, routeConfig } from "@/db/schema";
import { defaultJourney, defaultRoute } from "@/lib/defaults";
import seed from "@/data/journey.json";
import { mirrorJourney } from "@/lib/mirror";
import { clean, isAdmin } from "@/lib/server";

import { readObject } from "@/lib/http";
import { totals } from "@/lib/tracking";
import { dayOfWalk } from "@/lib/geo";

export async function GET() {
  const db = getDb();
  const [row] = await db.select().from(journey).where(eq(journey.id, 1)).limit(1);
  const [config] = await db.select().from(routeConfig).where(eq(routeConfig.id, 1)).limit(1);
  const startDate = config?.startDate ?? defaultRoute.startDate;
  const day = dayOfWalk(startDate);
  const distances = await totals(db, startDate);
  if (row) return Response.json({ ...row, ...distances, day, mode: day > 0 ? "live" : "preparation", id: undefined }, { headers: { "cache-control": "no-store" } });

  // A database that has never been written to is not the same as a walk that
  // has not started. Moving the site to new hosting left exactly that: an empty
  // table, and a homepage claiming Lucknow while Navneet stood in Bettiah.
  //
  // data/journey.json is the last published position, kept in the repository so
  // both assistants can read and edit it. Planting it here means the position
  // survives the database being replaced, rather than needing a phone with
  // signal to re-send it.
  await db.insert(journey).values({ id: 1, ...seed }).onConflictDoNothing();
  return Response.json({ ...seed, ...distances, day, mode: day > 0 ? "live" : "preparation" }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  if (!isAdmin(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  let body: Record<string, unknown>;
  try { body = await readObject(request); }
  catch { return Response.json({ error: "Invalid request" }, { status: 400 }); }

  // Saving a note must not overwrite a newer phone report with the admin
  // form's old copy. Only editable narrative fields belong to this endpoint.
  const limits = { status: 40, lastSleep: 100, latestTitle: 140, latestText: 500, latestUrl: 240, sponsorName: 100 } as const;
  const patch: Record<string, string> = {};
  for (const [key, max] of Object.entries(limits)) {
    if (Object.hasOwn(body, key)) patch[key] = clean(body[key], max);
  }
  if (patch.latestUrl && !/^\/(?!\/)|^https?:\/\//i.test(patch.latestUrl)) {
    return Response.json({ error: "Use a website URL or a link within this site." }, { status: 400 });
  }
  if (!Object.keys(patch).length) return Response.json({ error: "No editable status or notes were supplied. Positions and distances come from GPS." }, { status: 400 });
  const db = getDb();
  await db.insert(journey).values({ id: 1, ...defaultJourney, updatedAt: "", ...patch }).onConflictDoUpdate({ target: journey.id, set: patch });
  const [saved] = await db.select().from(journey).where(eq(journey.id, 1)).limit(1);
  await mirrorJourney(db);
  return Response.json({ ok: true, journey: saved });
}

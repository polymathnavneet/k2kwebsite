import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { journey } from "@/db/schema";
import { defaultJourney } from "@/lib/defaults";
import { clamp, clean, isAdmin } from "@/lib/server";

export async function GET() {
  const db = getDb();
  const [row] = await db.select().from(journey).where(eq(journey.id, 1)).limit(1);
  return Response.json(row ? { ...row, id: undefined } : defaultJourney);
}

export async function POST(request: Request) {
  if (!isAdmin(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json()) as Record<string, unknown>;
  const data = {
    id: 1,
    mode: body.mode === "live" ? "live" : "preparation",
    status: clean(body.status, 40) || "Walking",
    day: Math.round(clamp(body.day, 0, 365)),
    distanceToday: clamp(body.distanceToday, 0, 100),
    distanceTotal: clamp(body.distanceTotal, 0, 10000),
    stepsToday: Math.round(clamp(body.stepsToday, 0, 200000)),
    walkingMinutes: Math.round(clamp(body.walkingMinutes, 0, 1440)),
    currentPlace: clean(body.currentPlace, 100),
    lat: clamp(body.lat, -90, 90, defaultJourney.lat),
    lon: clamp(body.lon, -180, 180, defaultJourney.lon),
    temperature: body.temperature === "" || body.temperature == null ? null : clamp(body.temperature, -50, 60),
    altitude: body.altitude === "" || body.altitude == null ? null : clamp(body.altitude, -500, 9000),
    battery: body.battery === "" || body.battery == null ? null : Math.round(clamp(body.battery, 0, 100)),
    connectivity: clean(body.connectivity, 50),
    lastSleep: clean(body.lastSleep, 100),
    latestTitle: clean(body.latestTitle, 140),
    latestText: clean(body.latestText, 500),
    latestUrl: clean(body.latestUrl, 240) || "/journal",
    sponsorName: clean(body.sponsorName, 100),
    updatedAt: new Date().toISOString(),
  };
  const db = getDb();
  await db.insert(journey).values(data).onConflictDoUpdate({ target: journey.id, set: data });
  return Response.json({ ok: true, journey: data });
}

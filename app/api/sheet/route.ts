import { asc, desc, eq, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { gpsPoints, journalEntries, journey, messages, routeConfig, routeStops, timelineSteps } from "@/db/schema";
import { defaultJourney, defaultRoute } from "@/lib/defaults";

/**
 * The walk as spreadsheet rows.
 *
 * Google Sheets can pull a CSV from a URL with IMPORTDATA and re-fetch it on
 * its own, so a sheet built on this refreshes itself without anybody opening
 * anything. That is the whole point: no clicking, no export button, no copy and
 * paste, and nine months of walking accumulating in a place Navneet already
 * knows how to read.
 *
 * WHAT IS DELIBERATELY NOT HERE
 * Contact details, and the book pre-registration list. Everybody who writes to
 * this site is told their contact detail is never published, and the people on
 * the reader list gave an email address for a book rather than for a public
 * spreadsheet. A URL with no password is public whatever the sheet's own
 * sharing says, so those two stay behind the admin passcode where they were
 * promised to be. Everything below is already readable on the site itself.
 */

const KINDS = ["journey", "route", "timeline", "journal", "messages", "gps"] as const;
const EVERYTHING = "all";
type Kind = (typeof KINDS)[number];

/** RFC 4180: quote everything, double the quotes inside. Excel and Sheets agree on this. */
const cell = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
const csv = (rows: unknown[][]) => rows.map(row => row.map(cell).join(",")).join("\r\n");

export async function GET(request: Request) {
  const of = new URL(request.url).searchParams.get("of") ?? "";
  if (of !== EVERYTHING && !KINDS.includes(of as Kind)) {
    return new Response(`Ask for one of: ${[EVERYTHING, ...KINDS].join(", ")}\r\nExample: /api/sheet?of=all\r\n`, {
      status: 400, headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  const db = getDb();

  // One call for the lot.
  //
  // Six feeds meant six formulas in six places, and every one of those is a
  // chance for a setup to be half done and quietly wrong. This stacks all six
  // under their own headings so a single IMPORTDATA in a single cell keeps an
  // entire spreadsheet current - nine months of walking, one formula, pasted
  // once.
  if (of === EVERYTHING) {
    const titles: Record<Kind, string> = {
      journey: "WHERE HE IS NOW", route: "THE ROUTE", timeline: "BEFORE THE FIRST STEP",
      journal: "THE JOURNAL", messages: "THE PUBLIC WALL", gps: "THE GPS TRAIL",
    };
    const everything: unknown[][] = [
      ["A LONG WALK · Kanyakumari to Kashmir · Navneet Kumar"],
      ["This sheet fills itself from the website. Do not type in it - anything you add is overwritten."],
      ["Read at", new Date().toISOString()],
    ];
    for (const kind of KINDS) {
      everything.push([], [titles[kind]], ...(await build(db, kind)));
    }
    return csvResponse(everything);
  }

  const rows = await build(db, of as Kind);

  return csvResponse(rows);
}

function csvResponse(rows: unknown[][]) {
  return new Response(csv(rows), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      // Sheets re-fetches on its own schedule; a short cache keeps a busy
      // spreadsheet from asking the database the same question every minute.
      "cache-control": "public, max-age=300",
    },
  });
}

async function build(db: ReturnType<typeof getDb>, of: Kind): Promise<unknown[][]> {
  if (of === "journey") {
    const [row] = await db.select().from(journey).where(eq(journey.id, 1)).limit(1);
    const now = row ?? defaultJourney;
    return [
      ["field", "value"],
      ["mode", now.mode], ["status", now.status], ["day", now.day],
      ["distance today (km)", now.distanceToday], ["distance total (km)", now.distanceTotal],
      ["along the route (km)", now.routeProgressKm ?? 0], ["drawn line is this far away (km)", now.offRouteKm ?? 0],
      ["where", now.currentPlace], ["latitude", now.lat], ["longitude", now.lon],
      ["last slept", now.lastSleep], ["partner", now.sponsorName], ["updated", now.updatedAt ?? ""],
    ];
  }

  if (of === "route") {
    const [config] = await db.select().from(routeConfig).where(eq(routeConfig.id, 1)).limit(1);
    const stops = await db.select().from(routeStops).orderBy(asc(routeStops.sortOrder));
    const list = stops.length ? stops : defaultRoute.stops.map((stop, index) => ({ ...stop, sortOrder: index }));
    return [
      ["#", "stop", "state", "km from start", "latitude", "longitude", "why it is on the route"],
      ...list.map((stop, index) => [index + 1, stop.name, stop.state, stop.km, stop.lat, stop.lon, stop.note]),
      [], ["start date", config?.startDate ?? defaultRoute.startDate],
      ["planned pace (km per walking day)", config?.paceKmPerDay ?? defaultRoute.paceKmPerDay],
      ["total distance (km)", config?.totalDistance ?? defaultRoute.totalDistance],
    ];
  }

  if (of === "timeline") {
    const steps = await db.select().from(timelineSteps).orderBy(asc(timelineSteps.sortOrder));
    return [["date", "step", "what happens", "is the first step"],
      ...steps.map(step => [step.day, step.title, step.detail, step.isFinal ? "yes" : ""])];
  }

  if (of === "journal") {
    const entries = await db.select().from(journalEntries).orderBy(desc(journalEntries.day)).limit(1000);
    return [["date", "question asked", "what he wrote", "where", "phase"],
      ...entries.filter(entry => entry.published).map(entry => [entry.day, entry.question, entry.body, entry.place, entry.phase])];
  }

  if (of === "messages") {
    // Contact deliberately absent: see the note at the top of this file.
    const wall = await db.select({
      createdAt: messages.createdAt, type: messages.type, name: messages.name,
      place: messages.place, message: messages.message, status: messages.status,
      reply: messages.reply, repliedAt: messages.repliedAt,
    }).from(messages).where(ne(messages.status, "hidden")).orderBy(desc(messages.createdAt)).limit(1000);
    return [["arrived", "kind", "from", "place", "message", "status", "his reply", "replied"],
      ...wall.map(row => [row.createdAt, row.type, row.name, row.place, row.message, row.status, row.reply, row.repliedAt ?? ""])];
  }

  // The trail itself, newest first, capped so nine months of walking cannot
  // hand a spreadsheet more rows than it will open.
  const points = await db.select().from(gpsPoints).orderBy(desc(gpsPoints.recordedAt)).limit(5000);
  return [["recorded", "latitude", "longitude", "counted (km)", "counted", "speed (km/h)", "accuracy (m)"],
    ...points.map(point => [point.recordedAt, point.lat, point.lon, point.countedKm, point.counted ? "yes" : "no", point.speedKmh ?? "", point.accuracy ?? ""])];
}

import { asc, desc, eq, ne, sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "@/db/schema";
import { bookRegistrations, journey, media, messages, routeConfig, routeStops } from "@/db/schema";
import { defaultJourney, defaultRoute } from "@/lib/defaults";
import { githubEnabled, writeData } from "@/lib/github";
import type { Journey, WalkRoute } from "@/lib/types";

type Db = DrizzleD1Database<typeof schema>;

/**
 * Copies the current state of the database into the repository's `data/` files.
 *
 * Contact details are deliberately left out of every mirrored file. The
 * repository is public; email addresses and phone numbers stay in the database
 * and are only ever visible in the admin sheet.
 */

export async function mirrorMessages(db: Db) {
  if (!githubEnabled()) return;
  const rows = await db
    .select({
      id: messages.id,
      type: messages.type,
      name: messages.name,
      place: messages.place,
      message: messages.message,
      status: messages.status,
      reply: messages.reply,
      followUp: messages.followUp,
      followUpReply: messages.followUpReply,
      createdAt: messages.createdAt,
      repliedAt: messages.repliedAt,
      followUpAt: messages.followUpAt,
      followUpRepliedAt: messages.followUpRepliedAt,
    })
    .from(messages)
    .where(ne(messages.status, "hidden"))
    .orderBy(desc(messages.createdAt))
    .limit(1000);

  await writeData(
    "messages",
    {
      note: "The public wall. Contact details are never written here. Edit a reply and press 'Pull edits from GitHub' in the admin panel to apply it.",
      updatedAt: new Date().toISOString(),
      messages: rows,
    },
    `Update the public wall (${rows.length} messages)`
  );
}

export async function mirrorRoute(db: Db) {
  if (!githubEnabled()) return;
  const [config] = await db.select().from(routeConfig).where(eq(routeConfig.id, 1)).limit(1);
  const stops = await db
    .select({ name: routeStops.name, state: routeStops.state, lat: routeStops.lat, lon: routeStops.lon, km: routeStops.km, note: routeStops.note })
    .from(routeStops)
    .orderBy(asc(routeStops.sortOrder));

  const route: WalkRoute = config && stops.length
    ? { title: config.title, startDate: config.startDate, paceKmPerDay: config.paceKmPerDay, totalDistance: config.totalDistance, updatedAt: config.updatedAt, stops }
    : defaultRoute;

  await writeData("route", route, "Update the route");
}

export async function mirrorJourney(db: Db) {
  if (!githubEnabled()) return;
  const [row] = await db.select().from(journey).where(eq(journey.id, 1)).limit(1);
  if (!row) {
    await writeData("journey", defaultJourney, "Update the journey status");
    return;
  }
  const { id, ...rest } = row;
  void id; // the row id is an implementation detail, not part of the published file
  await writeData("journey", rest as Journey, "Update the journey status");
}

export async function mirrorBook(db: Db) {
  if (!githubEnabled()) return;
  const [result] = await db.select({ count: sql<number>`count(*)` }).from(bookRegistrations);
  await writeData(
    "book",
    {
      note: "Only the count lives here. Pre-registration contact details stay in the database and never enter this public repository.",
      title: "A Long Walk",
      preregistrations: Number(result?.count ?? 0),
      updatedAt: new Date().toISOString(),
    },
    "Update the pre-registration count"
  );
}

export async function mirrorMedia(db: Db) {
  if (!githubEnabled()) return;
  const rows = await db.select().from(media).orderBy(asc(media.sortOrder), desc(media.createdAt)).limit(500);
  await writeData(
    "media",
    {
      note: "Photos and videos, as links. Instagram and YouTube host the file; this only records where it is. Add or remove entries here and press 'Pull edits from GitHub' in the admin panel.",
      instagram: "https://www.instagram.com/polymath_navneet/",
      updatedAt: new Date().toISOString(),
      items: rows,
    },
    `Update the gallery (${rows.length} items)`
  );
}

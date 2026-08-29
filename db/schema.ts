import { sql } from "drizzle-orm";
import { integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  name: text("name").notNull(),
  place: text("place").notNull().default(""),
  message: text("message").notNull(),
  contact: text("contact").notNull(),
  status: text("status").notNull().default("public"),
  reply: text("reply").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  repliedAt: text("replied_at"),
});

export const bookRegistrations = sqliteTable(
  "book_registrations",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    contact: text("contact").notNull(),
    city: text("city").notNull().default(""),
    format: text("format").notNull().default("either"),
    note: text("note").notNull().default(""),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  table => [uniqueIndex("book_contact_unique").on(table.contact)]
);

export const routeConfig = sqliteTable("route_config", {
  id: integer("id").primaryKey(),
  title: text("title").notNull().default("A Long Walk"),
  startDate: text("start_date").notNull(),
  paceKmPerDay: real("pace_km_per_day").notNull().default(25),
  totalDistance: integer("total_distance").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const routeStops = sqliteTable("route_stops", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sortOrder: integer("sort_order").notNull(),
  name: text("name").notNull(),
  state: text("state").notNull().default(""),
  lat: real("lat").notNull(),
  lon: real("lon").notNull(),
  km: integer("km").notNull(),
  note: text("note").notNull().default(""),
});

export const journey = sqliteTable("journey", {
  id: integer("id").primaryKey(),
  mode: text("mode").notNull().default("preparation"),
  status: text("status").notNull().default("Preparing"),
  day: integer("day").notNull().default(0),
  distanceToday: real("distance_today").notNull().default(0),
  distanceTotal: real("distance_total").notNull().default(0),
  routeProgressKm: real("route_progress_km").notNull().default(0),
  offRouteKm: real("off_route_km").notNull().default(0),
  stepsToday: integer("steps_today").notNull().default(0),
  walkingMinutes: integer("walking_minutes").notNull().default(0),
  currentPlace: text("current_place").notNull().default("Lucknow, Uttar Pradesh"),
  lat: real("lat").notNull().default(26.8467),
  lon: real("lon").notNull().default(80.9462),
  temperature: real("temperature"),
  altitude: real("altitude"),
  battery: integer("battery"),
  connectivity: text("connectivity").notNull().default("Preparation mode"),
  lastSleep: text("last_sleep").notNull().default("Lucknow"),
  latestTitle: text("latest_title").notNull().default("The walk before the walk"),
  latestText: text("latest_text").notNull().default("Training, saving and preparing to cross India at walking speed."),
  latestUrl: text("latest_url").notNull().default("/journal"),
  sponsorName: text("sponsor_name").notNull().default("Partnership open"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const reactions = sqliteTable("reactions", {
  type: text("type").primaryKey(),
  count: integer("count").notNull().default(0),
});

/**
 * Places the site has spotted and wants Navneet to confirm before touching the
 * route. Nothing here changes the public site until it is accepted.
 */
export const routeSuggestions = sqliteTable("route_suggestions", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull().default("add_stop"),
  name: text("name").notNull(),
  state: text("state").notNull().default(""),
  lat: real("lat").notNull(),
  lon: real("lon").notNull(),
  km: integer("km").notNull(),
  reason: text("reason").notNull().default(""),
  status: text("status").notNull().default("pending"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  decidedAt: text("decided_at"),
});

/**
 * Photos and videos shown on the site. Nothing is uploaded or stored here -
 * only a link. Instagram and YouTube already host and stream the file, and a
 * link costs nothing, never expires from a storage bill, and cannot fill up.
 */
export const media = sqliteTable("media", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull().default("instagram"),
  url: text("url").notNull(),
  caption: text("caption").notNull().default(""),
  place: text("place").notNull().default(""),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

/**
 * The daily entry. One question a day, one answer, published straight to the
 * journal - so keeping the site alive costs a couple of minutes rather than an
 * evening of writing.
 */
export const journalEntries = sqliteTable("journal_entries", {
  id: text("id").primaryKey(),
  day: text("day").notNull(),
  question: text("question").notNull().default(""),
  body: text("body").notNull(),
  place: text("place").notNull().default(""),
  phase: text("phase").notNull().default("preparation"),
  published: integer("published").notNull().default(1),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

/**
 * Every GPS fix, kept.
 *
 * The journey row holds only the latest position and the running totals, which
 * cannot prove anything. This is the actual trail: where the walk really went,
 * when, and how accurate each reading was.
 *
 * The unique index on (recorded_at, lat, lon) is what makes uploading the same
 * track twice harmless - the second upload conflicts and is ignored, so no
 * distance is counted twice.
 */
export const gpsPoints = sqliteTable(
  "gps_points",
  {
    id: text("id").primaryKey(),
    recordedAt: text("recorded_at").notNull(),
    lat: real("lat").notNull(),
    lon: real("lon").notNull(),
    accuracy: real("accuracy"),
    source: text("source").notNull().default("manual"),
    countedKm: real("counted_km").notNull().default(0),
    speedKmh: real("speed_kmh"),
    counted: integer("counted").notNull().default(0),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  table => [uniqueIndex("gps_point_unique").on(table.recordedAt, table.lat, table.lon)]
);

import { sql } from "drizzle-orm";
import { integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  name: text("name").notNull(),
  place: text("place").notNull().default(""),
  message: text("message").notNull(),
  contact: text("contact").notNull(),
  status: text("status").notNull().default("held"),
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

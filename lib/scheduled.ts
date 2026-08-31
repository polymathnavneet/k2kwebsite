import { drizzle } from "drizzle-orm/d1";
import * as schema from "@/db/schema";
import { pull } from "@/lib/pull";

/**
 * What the timer runs.
 *
 * Kept apart from lib/pull.ts because the worker's scheduled handler has no
 * request to take a database binding from, so it builds its own rather than
 * going through getDb().
 *
 * A failure here is deliberately swallowed. A Google document that is briefly
 * unreachable must never take the site down with it; the next run is fifteen
 * minutes away, and the report of what went wrong is stored for the admin panel.
 */
export async function runScheduledPull(env: { DB: D1Database }) {
  try {
    const db = drizzle(env.DB, { schema });
    await pull(db);
  } catch {
    // Reported through the stored report rather than thrown into the void.
  }
}

import { desc, gte, lt } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "@/db/schema";
import { trackerAttempts } from "@/db/schema";

type Db = DrizzleD1Database<typeof schema>;

/**
 * A record of every knock on the tracking door.
 *
 * The site could not tell the difference between a tracker that had never been
 * set up and one that was being turned away at the door - both left the GPS
 * table empty. A position sat seventeen hours stale and nobody could say
 * whether the app was silent, misconfigured, or blocked, because a refused
 * request produced a 401 and vanished.
 *
 * Now every attempt leaves a line. Not the key that was offered - that is never
 * written down - only what was wrong with it, which is enough to name the fault
 * without keeping the secret.
 */

export type Outcome = "accepted" | "no-key" | "wrong-key" | "bad-position" | "error";

/** Kept short: this is a diagnosis, not an audit trail. */
const KEEP = 200;

export async function noteAttempt(db: Db, input: {
  route: string;
  method: string;
  outcome: Outcome;
  detail?: string;
  agent?: string | null;
}) {
  try {
    await db.insert(trackerAttempts).values({
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      route: input.route.slice(0, 40),
      method: input.method.slice(0, 10),
      outcome: input.outcome,
      detail: (input.detail ?? "").slice(0, 200),
      // Which app is knocking is the single most useful clue, and it is not a
      // secret: OwnTracks announces itself in every request it makes.
      agent: (input.agent ?? "").slice(0, 120),
    });
  } catch {
    // Diagnostics must never be the reason a real position is refused.
  }
}

/**
 * What the key looked like, without keeping it.
 *
 * "Nothing was sent" and "something was sent and it was wrong" are different
 * faults with different fixes, and telling them apart is the entire point of
 * this file. The value itself is never returned or stored.
 */
export function describeKey(request: Request, header: string): { outcome: Outcome; detail: string } {
  const url = new URL(request.url);
  const inQuery = url.searchParams.get("key");
  const inHeader = request.headers.get(header);
  const supplied = (inQuery ?? inHeader ?? "").trim();

  if (!supplied) return { outcome: "no-key", detail: "No key was sent at all — the URL is missing ?key=…" };
  return {
    outcome: "wrong-key",
    detail: `A key was sent (${supplied.length} characters, ${inQuery ? "in the web address" : "as a header"}) and it did not match.`,
  };
}

export type TrackerHealth = {
  /** Has anything ever been accepted? */
  everAccepted: boolean;
  /** Attempts in the last day, by what happened to them. */
  recent: { outcome: Outcome; count: number; last: string; detail: string; agent: string }[];
  /** The most recent attempt of any kind. */
  lastAttemptAt: string | null;
  total: number;
};

export async function trackerHealth(db: Db): Promise<TrackerHealth> {
  const since = new Date(Date.now() - 7 * 86400000).toISOString();
  const rows = await db
    .select()
    .from(trackerAttempts)
    .where(gte(trackerAttempts.at, since))
    .orderBy(desc(trackerAttempts.at))
    .limit(KEEP);

  const grouped = new Map<Outcome, { outcome: Outcome; count: number; last: string; detail: string; agent: string }>();
  for (const row of rows) {
    const outcome = row.outcome as Outcome;
    const seen = grouped.get(outcome);
    if (seen) seen.count += 1;
    else grouped.set(outcome, { outcome, count: 1, last: row.at, detail: row.detail, agent: row.agent });
  }

  return {
    everAccepted: rows.some(row => row.outcome === "accepted"),
    recent: [...grouped.values()].sort((a, b) => b.last.localeCompare(a.last)),
    lastAttemptAt: rows[0]?.at ?? null,
    total: rows.length,
  };
}

/**
 * Keep the table from growing without bound.
 *
 * Bounded by age rather than by row count: the health check only ever looks at
 * the last week, so anything older answers no question. An earlier draft of
 * this deleted everything at once - `gte(at, "")` matches every row ever
 * written - which is exactly the sort of thing that is obvious in hindsight and
 * invisible in a hurry.
 */
export async function trimAttempts(db: Db) {
  const cutoff = new Date(Date.now() - 7 * 86400000).toISOString();
  await db.delete(trackerAttempts).where(lt(trackerAttempts.at, cutoff));
}

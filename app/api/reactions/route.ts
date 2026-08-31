import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { reactionDays, reactions } from "@/db/schema";
import { istDayKey } from "@/lib/time";

/**
 * GET  /api/reactions -> the counts, so they can actually be shown
 * POST /api/reactions -> add one
 *
 * One per person per day per kind, keyed on a hash of the caller's IP. It does
 * not stop a determined script, but it stops the counts being meaningless.
 *
 * Every cheer used to go into a single running total that no page read and no
 * screen showed. The button said "Your cheer reached the road", and it reached
 * a number in a database instead. Both figures are returned now - the day's and
 * the total - because the day's is the one that means something to a man
 * checking his phone at the end of it, and the total is the one that makes a
 * stranger's tap feel like it joined something.
 */

const KINDS = ["cheer", "follow"] as const;
const seenToday = new Map<string, number>();

type Counts = { cheer: number; follow: number };

async function readCounts(db: ReturnType<typeof getDb>) {
  const total: Counts = { cheer: 0, follow: 0 };
  for (const row of await db.select().from(reactions)) {
    if (row.type in total) total[row.type as keyof Counts] = row.count;
  }

  const day = istDayKey();
  const today: Counts = { cheer: 0, follow: 0 };
  for (const row of await db.select().from(reactionDays).where(eq(reactionDays.day, day))) {
    if (row.type in today) today[row.type as keyof Counts] = row.count;
  }

  return { counts: total, today, day };
}

export async function GET() {
  return Response.json(await readCounts(getDb()));
}

export async function POST(request: Request) {
  let body: { type?: string };
  try {
    body = (await request.json()) as { type?: string };
  } catch {
    // Malformed JSON is the caller's mistake, not a server fault.
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const type = String(body?.type ?? "");
  if (!KINDS.includes(type as (typeof KINDS)[number])) {
    return Response.json({ error: "Unknown reaction" }, { status: 400 });
  }

  const db = getDb();
  const who = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "unknown";
  // Keyed on the Indian day, so "one cheer a day" turns over at the same
  // midnight the rest of the site turns over on rather than at UTC midnight.
  const day = istDayKey();
  const key = `${type}:${who}:${day}`;
  const now = Date.now();

  // Keep the map from growing without bound across a long-lived isolate.
  if (seenToday.size > 5000) seenToday.clear();
  if (now - (seenToday.get(key) ?? 0) < 86400000) {
    return Response.json({ ok: true, already: true, ...(await readCounts(db)) });
  }
  seenToday.set(key, now);

  await db.insert(reactions).values({ type, count: 1 }).onConflictDoUpdate({
    target: reactions.type,
    set: { count: sql`${reactions.count} + 1` },
  });
  await db.insert(reactionDays).values({ day, type, count: 1 }).onConflictDoUpdate({
    target: [reactionDays.day, reactionDays.type],
    set: { count: sql`${reactionDays.count} + 1` },
  });

  return Response.json({ ok: true, ...(await readCounts(db)) });
}


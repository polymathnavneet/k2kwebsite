import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { reactions } from "@/db/schema";

/**
 * GET  /api/reactions -> the counts, so they can actually be shown
 * POST /api/reactions -> add one
 *
 * One per person per day per kind, keyed on a hash of the caller's IP. It does
 * not stop a determined script, but it stops the counts being meaningless.
 */

const KINDS = ["cheer", "follow"] as const;
const seenToday = new Map<string, number>();

export async function GET() {
  const db = getDb();
  const rows = await db.select().from(reactions);
  const counts: Record<string, number> = { cheer: 0, follow: 0 };
  for (const row of rows) counts[row.type] = row.count;
  return Response.json({ counts });
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

  const who = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "unknown";
  const key = `${type}:${who}:${new Date().toISOString().slice(0, 10)}`;
  const now = Date.now();

  // Keep the map from growing without bound across a long-lived isolate.
  if (seenToday.size > 5000) seenToday.clear();
  if (now - (seenToday.get(key) ?? 0) < 86400000) {
    const db = getDb();
    const rows = await db.select().from(reactions);
    const counts: Record<string, number> = { cheer: 0, follow: 0 };
    for (const row of rows) counts[row.type] = row.count;
    return Response.json({ ok: true, already: true, counts });
  }
  seenToday.set(key, now);

  const db = getDb();
  await db.insert(reactions).values({ type, count: 1 }).onConflictDoUpdate({
    target: reactions.type,
    set: { count: sql`${reactions.count} + 1` },
  });

  const rows = await db.select().from(reactions);
  const counts: Record<string, number> = { cheer: 0, follow: 0 };
  for (const row of rows) counts[row.type] = row.count;
  return Response.json({ ok: true, counts });
}

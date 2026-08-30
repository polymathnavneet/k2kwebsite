import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { journalEntries, journey } from "@/db/schema";
import { defaultJourney } from "@/lib/defaults";
import { promptForDay, tapsForMode, todayKey } from "@/lib/prompts";
import { clean, isAdmin, isAssistant, publicText } from "@/lib/server";

/**
 * GET  /api/journal -> the published entries, plus today's question
 * POST /api/journal -> answer today's question (admin)
 *
 * Answering publishes immediately. There is no draft state and no separate
 * publish step, because a system that needs two actions a day gets used for a
 * week and then stops.
 */

export async function GET(request: Request) {
  const db = getDb();
  const url = new URL(request.url);
  const admin = url.searchParams.get("admin") === "1" && isAdmin(request);

  const [current] = await db.select().from(journey).where(eq(journey.id, 1)).limit(1);
  const mode = current?.mode ?? defaultJourney.mode;

  const rows = await db
    .select()
    .from(journalEntries)
    .orderBy(desc(journalEntries.day), desc(journalEntries.createdAt))
    .limit(admin ? 400 : 200);

  const visible = admin ? rows : rows.filter(row => row.published);
  const day = todayKey();
  const answeredToday = rows.some(row => row.day === day);

  // How long since the last entry, so the panel can say so plainly.
  const latest = rows[0];
  const daysSince = latest
    ? Math.max(0, Math.round((Date.now() - new Date(`${latest.day}T12:00:00`).getTime()) / 86400000))
    : null;

  return Response.json({
    rows: visible,
    today: { day, question: promptForDay(mode), answered: answeredToday, mode, taps: tapsForMode(mode) },
    daysSince,
  });
}

export async function POST(request: Request) {
  // The daily check-in carries a key that publishes entries and nothing else,
  // so deleting is refused below even though writing is allowed here.
  const admin = isAdmin(request);
  const assistant = isAssistant(request);
  if (!admin && !assistant) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const db = getDb();
  const action = clean(body.action, 20) || "answer";

  if (action === "remove") {
    if (!admin) return Response.json({ error: "That needs the admin passcode." }, { status: 403 });
    await db.delete(journalEntries).where(eq(journalEntries.id, clean(body.id, 80)));
    return Response.json({ ok: true, removed: true });
  }

  if (action !== "answer") return Response.json({ error: "Unknown action" }, { status: 400 });

  const answer = publicText(body.body);
  if (answer.length < 3) return Response.json({ error: "Write a little more than that." }, { status: 400 });

  const [current] = await db.select().from(journey).where(eq(journey.id, 1)).limit(1);
  const mode = current?.mode ?? defaultJourney.mode;
  const day = /^\d{4}-\d{2}-\d{2}$/.test(String(body.day)) ? String(body.day) : todayKey();

  // Answering twice in a day replaces the entry rather than making two.
  const [existing] = await db.select({ id: journalEntries.id }).from(journalEntries).where(eq(journalEntries.day, day)).limit(1);

  const row = {
    id: existing?.id ?? crypto.randomUUID(),
    day,
    question: clean(body.question, 200) || promptForDay(mode),
    body: answer,
    place: clean(body.place, 100) || current?.currentPlace || "",
    phase: mode === "live" ? "road" : "preparation",
    published: 1,
    createdAt: new Date().toISOString(),
  };

  if (existing) await db.update(journalEntries).set(row).where(eq(journalEntries.id, existing.id));
  else await db.insert(journalEntries).values(row);

  return Response.json({ ok: true, entry: row, replaced: Boolean(existing) }, { status: existing ? 200 : 201 });
}

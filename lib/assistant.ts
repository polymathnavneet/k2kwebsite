import { and, desc, eq, ne, sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "@/db/schema";
import { assistantMemory, bookRegistrations, gpsPoints, journalEntries, journey, media, messages, routeConfig, routeStops, routeSuggestions } from "@/db/schema";
import { defaultJourney, defaultRoute } from "@/lib/defaults";
import { promptForDay, tapsForMode } from "@/lib/prompts";
import { istDayKey, walkDay } from "@/lib/time";
import { opener, why } from "@/lib/voice";

type Db = DrizzleD1Database<typeof schema>;

/**
 * The thing that notices what is wrong and asks about it.
 *
 * It is not a language model, deliberately. A model would need a key, a bill
 * and a network round trip to guess at what might be stale; this reads the
 * database and *knows*. It knows the last GPS fix was four days ago, that
 * Priya's message has no reply, that the walk was due to start on Thursday and
 * the site still says preparation. Those are facts, and facts make better
 * questions than guesses.
 *
 * Each question carries the action that answering it performs, so a reply is
 * not filed away for later - it changes the site.
 */

export type Ask = {
  id: string;
  kind: string;
  /** Higher runs first. */
  priority: number;
  question: string;
  detail?: string;
  /** What answering looks like: a tap, a number, some words, or yes/no. */
  input: "taps" | "text" | "number" | "confirm" | "gps" | "link";
  taps?: string[];
  /** Carried back on the answer so the server knows what to change. */
  context?: Record<string, unknown>;
};

const HOURS = 3600000;

/* --------------------------------------------------------------- memory */

/** Bump a tally. This is the whole of "it learns". */
export async function remember(db: Db, key: string, kind: string, value = "") {
  const existing = await db.select().from(assistantMemory).where(eq(assistantMemory.key, key)).limit(1);
  const count = (existing[0]?.count ?? 0) + 1;
  const row = { key, kind, value: value || existing[0]?.value || "", count, updatedAt: new Date().toISOString() };
  await db.insert(assistantMemory).values(row).onConflictDoUpdate({ target: assistantMemory.key, set: row });
}

export async function recall(db: Db) {
  const rows = await db.select().from(assistantMemory).orderBy(desc(assistantMemory.count)).limit(200);
  const taps = rows.filter(r => r.kind === "tap");
  const skips = new Map(rows.filter(r => r.kind === "skip").map(r => [r.value, r.count]));
  const facts = rows.filter(r => r.kind === "fact").slice(0, 10);
  return { taps, skips, facts };
}

/**
 * How long to leave a question alone after it has been skipped.
 *
 * Asking the same thing every single time after it has been waved away three
 * times is how a helpful thing turns into a nagging one. Backing off is not
 * giving up: the question returns, just less often.
 */
function skippedTooOften(skips: Map<string, number>, kind: string) {
  const count = skips.get(kind) ?? 0;
  if (count < 3) return false;
  // After three skips, surface it roughly one time in three.
  return Math.floor(Date.now() / 3600000) % 3 !== 0;
}

export async function buildAsks(db: Db): Promise<{ asks: Ask[]; summary: string; opener: string }> {
  const [current] = await db.select().from(journey).where(eq(journey.id, 1)).limit(1);
  const [config] = await db.select().from(routeConfig).where(eq(routeConfig.id, 1)).limit(1);
  const state = current ?? { id: 1, ...defaultJourney };
  const startDate = config?.startDate ?? defaultRoute.startDate;
  const live = state.mode === "live";
  const now = Date.now();

  const asks: Ask[] = [];
  const memory = await recall(db);

  /* ------------------------------------------------- has the walk started? */
  const dueDay = walkDay(startDate);
  if (!live && dueDay >= 1) {
    asks.push({
      id: "mode",
      kind: "mode",
      priority: 100,
      question: `The walk was due to start on ${startDate}. Have you started?`,
      detail: "The site still says preparation, so nothing is counting distance.",
      input: "confirm",
    });
  }

  /* --------------------------------------------------------- where are you */
  const [lastFix] = await db.select().from(gpsPoints).orderBy(desc(gpsPoints.recordedAt)).limit(1);
  const fixAgeHours = lastFix ? (now - new Date(lastFix.recordedAt).getTime()) / HOURS : null;
  if (live && (fixAgeHours === null || fixAgeHours > 20)) {
    asks.push({
      id: "gps",
      kind: "gps",
      priority: 95,
      question: "Where are you now?",
      detail: fixAgeHours === null
        ? "No position has ever been recorded, so the map is showing a guess."
        : `The last position was ${Math.round(fixAgeHours)} hours ago, in ${state.currentPlace}.`,
      input: "gps",
    });
  }

  /* ---------------------------------------------------- a place to confirm */
  const pending = await db.select().from(routeSuggestions).where(eq(routeSuggestions.status, "pending")).orderBy(desc(routeSuggestions.createdAt)).limit(3);
  for (const suggestion of pending) {
    asks.push({
      id: `suggestion:${suggestion.id}`,
      kind: "suggestion",
      priority: 90,
      question: `Add ${suggestion.name} to your route?`,
      detail: suggestion.reason,
      input: "confirm",
      context: { suggestionId: suggestion.id, name: suggestion.name, km: suggestion.km },
    });
  }

  /* ------------------------------------------------- someone wrote to you */
  const unanswered = await db
    .select({ id: messages.id, name: messages.name, place: messages.place, message: messages.message, createdAt: messages.createdAt })
    .from(messages)
    .where(and(eq(messages.reply, ""), ne(messages.status, "hidden")))
    .orderBy(desc(messages.createdAt))
    .limit(3);
  for (const row of unanswered) {
    asks.push({
      id: `reply:${row.id}`,
      kind: "reply",
      priority: 80,
      question: `${row.name}${row.place ? ` from ${row.place}` : ""} wrote to you. Reply?`,
      detail: row.message.length > 220 ? `${row.message.slice(0, 220)}…` : row.message,
      input: "text",
      context: { messageId: row.id, name: row.name },
    });
  }

  /* ------------------------------------------------------ how was your day */
  const today = istDayKey();
  const [todayEntry] = await db.select({ id: journalEntries.id }).from(journalEntries).where(eq(journalEntries.day, today)).limit(1);
  if (!todayEntry) {
    const [latest] = await db.select({ day: journalEntries.day }).from(journalEntries).orderBy(desc(journalEntries.day)).limit(1);
    const gap = latest ? Math.round((new Date(today).getTime() - new Date(latest.day).getTime()) / 86400000) : null;
    asks.push({
      id: `journal:${today}`,
      kind: "journal",
      priority: 70,
      question: promptForDay(state.mode),
      detail: gap && gap > 1 ? `Nothing written for ${gap} days.` : "Nothing written today yet.",
      input: "taps",
      // The things he actually taps come first, so his own shorthand is nearest
      // his thumb instead of buried under options he has never used.
      taps: orderByUse(tapsForMode(state.mode).flatMap(group => group.options), memory.taps).slice(0, 12),
      context: { day: today },
    });
  }

  /* ------------------------------------------------------ how far did you go */
  if (live && state.distanceToday === 0 && fixAgeHours !== null && fixAgeHours < 20) {
    asks.push({
      id: "distance",
      kind: "distance",
      priority: 60,
      question: "How far did you walk today?",
      detail: "The GPS has not recorded any distance today. If you walked without it, say how far.",
      input: "number",
    });
  }

  /* --------------------------------------------------------- nothing to see */
  const [shots] = await db.select({ total: sql<number>`count(*)` }).from(media);
  if (Number(shots?.total ?? 0) === 0) {
    asks.push({
      id: "media",
      kind: "media",
      priority: 40,
      question: "There are no pictures on the site yet. Paste an Instagram link?",
      detail: "Share → Copy link on any post or reel. It appears on the gallery straight away.",
      input: "link",
    });
  }

  /* ----------------------------------------------------------- the summary */
  const [stopCount] = await db.select({ total: sql<number>`count(*)` }).from(routeStops);
  const [bookCount] = await db.select({ total: sql<number>`count(*)` }).from(bookRegistrations);
  const summary = live
    ? `Day ${dueDay} · ${Math.round(state.routeProgressKm || state.distanceTotal)} km along · ${state.currentPlace || "position unknown"} · ${Number(stopCount?.total ?? 0)} stops · ${Number(bookCount?.total ?? 0)} pre-registered`
    : `Preparation · starts ${startDate} · ${Number(stopCount?.total ?? 0)} stops · ${Number(bookCount?.total ?? 0)} pre-registered`;

  const quietened = asks.filter(ask => !skippedTooOften(memory.skips, ask.kind));
  quietened.sort((a, b) => b.priority - a.priority);

  const [yesterdayEntry] = await db.select().from(journalEntries).orderBy(desc(journalEntries.day)).limit(1);
  const daysSinceEntry = yesterdayEntry
    ? Math.round((new Date(today).getTime() - new Date(yesterdayEntry.day).getTime()) / 86400000)
    : null;

  const facts = {
    live,
    day: dueDay,
    place: state.currentPlace,
    fixAgeHours,
    waiting: unanswered.length,
    daysSinceEntry,
    todayKm: state.distanceToday,
  };

  // Say why each question is worth answering, in terms of what it costs not to.
  for (const ask of quietened) {
    const reason = why(ask.kind, facts);
    if (reason && !ask.detail) ask.detail = reason;
  }

  return { asks: quietened, summary, opener: opener(facts) };
}

/** Put the options he actually uses at the front. */
function orderByUse(options: string[], taps: { value: string; count: number }[]) {
  const used = new Map(taps.map(t => [t.value, t.count]));
  return [...options].sort((a, b) => (used.get(b) ?? 0) - (used.get(a) ?? 0));
}

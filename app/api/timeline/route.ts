import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { routeConfig, timelineSteps } from "@/db/schema";
import { clean, isAdmin } from "@/lib/server";
import seed from "@/data/timeline.json";

/**
 * The run-up to the first step.
 *
 * GET  -> the steps, oldest first. Seeded from data/timeline.json the first time
 *         it is asked for, so a fresh database is not an empty homepage.
 * POST -> replace them (admin only). The step marked final carries the walk's
 *         start date, and saving writes it to the route as well, so moving "the
 *         first step" moves every arrival date on the route with it. One edit,
 *         and the whole site follows.
 */

const DAY = /^\d{4}-\d{2}-\d{2}$/;

type Step = { id: string; day: string; title: string; detail: string; sortOrder: number; isFinal: number };

const shape = (rows: Step[]) => rows.map(row => ({
  date: row.day, title: row.title, detail: row.detail, final: row.isFinal === 1,
}));

async function readSteps(db: ReturnType<typeof getDb>) {
  const rows = await db.select().from(timelineSteps).orderBy(asc(timelineSteps.sortOrder));
  if (rows.length) return rows as Step[];

  const planted = seed.steps.map((step, index) => ({
    id: `seed-${index}`,
    day: step.date,
    title: step.title,
    detail: step.detail,
    sortOrder: index,
    isFinal: (step as { final?: boolean }).final ? 1 : 0,
  }));
  await db.insert(timelineSteps).values(planted).onConflictDoNothing();
  return planted as Step[];
}

export async function GET() {
  const db = getDb();
  const rows = await readSteps(db);
  return Response.json({ steps: shape(rows) });
}

export async function POST(request: Request) {
  if (!isAdmin(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  if (!Array.isArray(body.steps) || body.steps.length < 1 || body.steps.length > 40) {
    return Response.json({ error: "The plan needs between 1 and 40 steps." }, { status: 400 });
  }

  const rows: Step[] = [];
  for (const [index, item] of (body.steps as Record<string, unknown>[]).entries()) {
    const day = clean(item.date ?? item.day, 10);
    if (!DAY.test(day)) return Response.json({ error: `Step ${index + 1}: the date must look like 2026-12-17.` }, { status: 400 });
    const title = clean(item.title, 120);
    if (!title) return Response.json({ error: `Step ${index + 1} needs a title.` }, { status: 400 });
    rows.push({ id: crypto.randomUUID(), day, title, detail: clean(item.detail, 400), sortOrder: index, isFinal: item.final ? 1 : 0 });
  }

  // Sorted by date, so a step added at the end still lands in the right place
  // and the last one really is the last one.
  rows.sort((a, b) => a.day.localeCompare(b.day));
  rows.forEach((row, index) => { row.sortOrder = index; });
  // Exactly one final step: the walk starts once, and it starts last.
  rows.forEach(row => { row.isFinal = 0; });
  const last = rows[rows.length - 1];
  last.isFinal = 1;

  const db = getDb();
  await db.delete(timelineSteps);
  await db.insert(timelineSteps).values(rows);

  // The whole point: the last step is the start date, so the route follows it.
  const [config] = await db.select().from(routeConfig).where(eq(routeConfig.id, 1)).limit(1);
  if (config && config.startDate !== last.day) {
    await db.update(routeConfig).set({ startDate: last.day, updatedAt: new Date().toISOString() }).where(eq(routeConfig.id, 1));
  }

  return Response.json({ ok: true, steps: shape(rows), startDate: last.day, movedRoute: Boolean(config) && config.startDate !== last.day });
}

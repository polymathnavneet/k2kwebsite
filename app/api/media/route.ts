import { asc, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { media } from "@/db/schema";
import { detectKind } from "@/lib/embed";
import { mirrorMedia } from "@/lib/mirror";
import { clamp, clean, isAdmin } from "@/lib/server";

/**
 * GET  /api/media -> the gallery
 * POST /api/media -> add, remove or reorder an item (admin)
 *
 * Only links are stored. Nothing is uploaded, so there is no storage bill, no
 * upload limit and nothing that can fill up. Instagram and YouTube already host
 * and stream the file far better than this site could.
 */

const MAX_ITEMS = 500;

export async function GET() {
  const db = getDb();
  const rows = await db
    .select()
    .from(media)
    .orderBy(asc(media.sortOrder), desc(media.createdAt))
    .limit(MAX_ITEMS);
  return Response.json({ rows });
}

export async function POST(request: Request) {
  if (!isAdmin(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const db = getDb();
  const action = clean(body.action, 20) || "add";

  if (action === "remove") {
    const id = clean(body.id, 80);
    await db.delete(media).where(eq(media.id, id));
    await mirrorMedia(db);
    return Response.json({ ok: true, removed: true });
  }

  if (action === "move") {
    const id = clean(body.id, 80);
    const sortOrder = Math.round(clamp(body.sortOrder, -9999, 9999));
    await db.update(media).set({ sortOrder }).where(eq(media.id, id));
    await mirrorMedia(db);
    return Response.json({ ok: true, moved: true });
  }

  if (action !== "add") return Response.json({ error: "Unknown action" }, { status: 400 });

  const url = clean(body.url, 500);
  const kind = detectKind(url);
  if (!kind) {
    return Response.json({
      error: "That link is not one this site can show. Paste an Instagram post or reel, a YouTube video, or a direct image link ending in .jpg or .png.",
    }, { status: 400 });
  }

  const [existing] = await db.select({ id: media.id }).from(media).where(eq(media.url, url)).limit(1);
  if (existing) return Response.json({ ok: true, duplicate: true, id: existing.id });

  const [count] = await db.select({ total: sql<number>`count(*)` }).from(media);
  if (Number(count?.total ?? 0) >= MAX_ITEMS) {
    return Response.json({ error: `The gallery is full at ${MAX_ITEMS} items. Remove one first.` }, { status: 400 });
  }

  const row = {
    id: crypto.randomUUID(),
    kind,
    url,
    caption: clean(body.caption, 300),
    place: clean(body.place, 100),
    sortOrder: Math.round(clamp(body.sortOrder, -9999, 9999)),
    createdAt: new Date().toISOString(),
  };

  await db.insert(media).values(row);
  await mirrorMedia(db);
  return Response.json({ ok: true, item: row }, { status: 201 });
}

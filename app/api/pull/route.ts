import { getDb } from "@/db";
import { pull, saveSetting, setting, SETTING_KEYS } from "@/lib/pull";
import { isAdmin, isAssistant } from "@/lib/server";

/**
 * GET  -> which sheet and document run the site, and how the last read went.
 * POST -> read them now, or point the site at different ones.
 *
 * The site also reads them on its own every quarter of an hour; this is for
 * when Navneet has just typed something and does not want to wait.
 */

export async function GET(request: Request) {
  if (!isAdmin(request) && !isAssistant(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const db = getDb();
  const report = await setting(db, SETTING_KEYS.report);
  return Response.json({
    sheet: await setting(db, SETTING_KEYS.sheet),
    doc: await setting(db, SETTING_KEYS.doc),
    pulledAt: await setting(db, SETTING_KEYS.pulledAt),
    last: report ? JSON.parse(report) : null,
  });
}

export async function POST(request: Request) {
  if (!isAdmin(request) && !isAssistant(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: Record<string, unknown> = {};
  try { body = (await request.json()) as Record<string, unknown>; } catch { /* a bare POST just means "read them now" */ }

  const db = getDb();
  // Changing which files run the site is an admin decision, not something the
  // daily check-in should be able to do with its publishing key.
  if (typeof body.sheet === "string" || typeof body.doc === "string") {
    if (!isAdmin(request)) return Response.json({ error: "That needs the admin passcode." }, { status: 403 });
    if (typeof body.sheet === "string") await saveSetting(db, SETTING_KEYS.sheet, body.sheet.trim().slice(0, 400));
    if (typeof body.doc === "string") await saveSetting(db, SETTING_KEYS.doc, body.doc.trim().slice(0, 400));
  }

  return Response.json({ ok: true, report: await pull(db) });
}

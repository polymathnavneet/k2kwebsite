import { readObject } from "@/lib/http";
import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { bookRegistrations } from "@/db/schema";
import { mirrorBook } from "@/lib/mirror";
import { clean, isAdmin } from "@/lib/server";

export async function GET(request: Request) {
  const db = getDb();
  const url = new URL(request.url);
  if (url.searchParams.get("admin") === "1") {
    if (!isAdmin(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const rows = await db.select().from(bookRegistrations).orderBy(desc(bookRegistrations.createdAt)).limit(5000);
    return Response.json({ rows });
  }
  const [result] = await db.select({ count: sql<number>`count(*)` }).from(bookRegistrations);
  return Response.json({ count: Number(result?.count ?? 0) });
}

export async function POST(request: Request) {
  const db = getDb();
  let body: Record<string, unknown>;
  try {
    body = await readObject(request);
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }
  const name = clean(body.name, 70);
  const contact = clean(body.contact, 160).toLowerCase();
  if (name.length < 2 || contact.length < 5) {
    return Response.json({ error: "Name and contact are required." }, { status: 400 });
  }
  const existing = await db.select({ id: bookRegistrations.id }).from(bookRegistrations).where(eq(bookRegistrations.contact, contact)).limit(1);
  if (existing.length) {
    const [result] = await db.select({ count: sql<number>`count(*)` }).from(bookRegistrations);
    return Response.json({ ok: true, duplicate: true, count: Number(result?.count ?? 0) });
  }
  const inserted = await db.insert(bookRegistrations).values({
    id: crypto.randomUUID(),
    name,
    contact,
    city: clean(body.city, 100),
    format: ["paperback", "ebook", "either"].includes(String(body.format)) ? String(body.format) : "either",
    note: clean(body.note, 400),
  }).onConflictDoNothing().returning({ id: bookRegistrations.id });
  const [result] = await db.select({ count: sql<number>`count(*)` }).from(bookRegistrations);
  await mirrorBook(db);
  return Response.json({ ok: true, duplicate: !inserted.length, count: Number(result?.count ?? 0) }, { status: inserted.length ? 201 : 200 });
}

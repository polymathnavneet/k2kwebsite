import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { reactions } from "@/db/schema";

export async function POST(request: Request) {
  const body = (await request.json()) as { type?: string };
  if (!body.type || !["cheer", "follow"].includes(body.type)) {
    return Response.json({ error: "Unknown reaction" }, { status: 400 });
  }
  const db = getDb();
  await db.insert(reactions).values({ type: body.type, count: 1 }).onConflictDoUpdate({
    target: reactions.type,
    set: { count: sql`${reactions.count} + 1` },
  });
  return Response.json({ ok: true });
}

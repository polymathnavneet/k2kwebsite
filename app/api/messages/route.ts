import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { messages } from "@/db/schema";
import { mirrorMessages } from "@/lib/mirror";
import { clean, isAdmin, publicText } from "@/lib/server";

export async function GET(request: Request) {
  const db = getDb();
  const url = new URL(request.url);
  if (url.searchParams.get("admin") === "1") {
    if (!isAdmin(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const rows = await db.select().from(messages).orderBy(desc(messages.createdAt)).limit(1000);
    return Response.json({ rows });
  }
  const rows = await db
    .select({
      id: messages.id,
      type: messages.type,
      name: messages.name,
      place: messages.place,
      message: messages.message,
      status: messages.status,
      reply: messages.reply,
      createdAt: messages.createdAt,
      repliedAt: messages.repliedAt,
    })
    .from(messages)
    .where(eq(messages.status, "public"))
    .orderBy(desc(messages.createdAt))
    .limit(200);
  return Response.json({ rows });
}

export async function POST(request: Request) {
  const db = getDb();
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  if (body.action) {
    if (!isAdmin(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const id = clean(body.id, 80);
    const action = clean(body.action, 20);
    if (action === "reply") {
      const reply = publicText(body.reply);
      if (!reply) return Response.json({ error: "Write a reply first" }, { status: 400 });
      await db.update(messages).set({ reply, status: "public", repliedAt: new Date().toISOString() }).where(eq(messages.id, id));
    } else if (action === "publish") {
      await db.update(messages).set({ status: "public" }).where(eq(messages.id, id));
    } else if (action === "hide") {
      await db.update(messages).set({ status: "hidden" }).where(eq(messages.id, id));
    } else {
      return Response.json({ error: "Unknown action" }, { status: 400 });
    }
    await mirrorMessages(db);
    return Response.json({ ok: true });
  }

  const allowed = ["place", "story", "support", "question"];
  const type = allowed.includes(String(body.type)) ? String(body.type) : "question";
  const name = clean(body.name, 60);
  const contact = clean(body.contact, 160);
  const place = clean(body.place, 100);
  const message = publicText(body.message);
  if (name.length < 2 || contact.length < 5 || message.length < 8) {
    return Response.json({ error: "Add a public name, private contact and a longer message." }, { status: 400 });
  }
  // Everything goes on the wall as it arrives. Only likely spam is held back,
  // and that still lands in the admin sheet where it can be released.
  const spam = /(https?:\/\/.*){2,}|casino|crypto giveaway|viagra/i.test(message);
  const status = spam ? "held" : "public";
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  await db.insert(messages).values({ id, type, name, contact, place, message, status, createdAt });

  if (status === "public") await mirrorMessages(db);

  return Response.json({ ok: true, id, public: status === "public" }, { status: 201 });
}

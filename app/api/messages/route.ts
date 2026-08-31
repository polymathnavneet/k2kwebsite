import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { messages } from "@/db/schema";
import { mirrorMessages } from "@/lib/mirror";
import { clean, isAdmin, isAssistant, publicText } from "@/lib/server";
import seed from "@/data/messages.json";

export async function GET(request: Request) {
  const db = getDb();
  const url = new URL(request.url);
  if (url.searchParams.get("admin") === "1") {
    if (!isAdmin(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const rows = await db.select().from(messages).orderBy(desc(messages.createdAt)).limit(1000);
    return Response.json({ rows });
  }
  // A wall with nothing on it reads as a wall that does not work. Moving to new
  // hosting emptied the table, so the messages already published are planted
  // back from the repository file - the same file the mirror writes, which by
  // design carries no contact details.
  const [any] = await db.select({ id: messages.id }).from(messages).limit(1);
  if (!any && seed.messages.length) {
    await db.insert(messages).values(seed.messages.map(row => ({ ...row, contact: "" }))).onConflictDoNothing();
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
    const admin = isAdmin(request);
    // Replying in public is the one thing the daily check-in may do here.
    // Hiding a message and putting one on the wall stay with the passcode.
    const assistant = isAssistant(request);
    if (!admin && !assistant) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const id = clean(body.id, 80);
    const action = clean(body.action, 20);
    if (!admin && action !== "reply") return Response.json({ error: "That needs the admin passcode." }, { status: 403 });
    if (action === "reply") {
      const reply = publicText(body.reply);
      if (!reply) return Response.json({ error: "Write a reply first" }, { status: 400 });
      await db.update(messages).set({ reply, status: "public", repliedAt: new Date().toISOString() }).where(eq(messages.id, id));
    } else if (action === "publish") {
      await db.update(messages).set({ status: "public" }).where(eq(messages.id, id));
    } else if (action === "hide") {
      await db.update(messages).set({ status: "hidden" }).where(eq(messages.id, id));
    } else if (action === "delete") {
      // Hiding takes a message off the wall but keeps the person's contact
      // detail. Deleting is for the other case - a message that should not be
      // held at all - so the row goes, contact included, and does not come back.
      if (!admin) return Response.json({ error: "That needs the admin passcode." }, { status: 403 });
      await db.delete(messages).where(eq(messages.id, id));
    } else {
      return Response.json({ error: "Unknown action" }, { status: 400 });
    }
    await mirrorMessages(db);
    return Response.json({ ok: true });
  }

  // "walk" is somebody offering to walk a stretch of it with him. It goes on
  // the wall like the rest: the whole point is that other people can see the
  // road filling up with company.
  const allowed = ["place", "story", "support", "question", "walk", "sponsor"];
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
  // A sponsorship enquiry is a business conversation, not a note to the wall.
  // Publishing one would put a brand's interest, and often a budget, in front
  // of every other brand reading the page.
  const status = type === "sponsor" ? "held" : spam ? "held" : "public";
  // A send that timed out but actually arrived is retried from the outbox with
  // the same clientId. Using it as the row id makes the retry a no-op instead
  // of a second copy of somebody's message.
  const supplied = clean(body.clientId, 80);
  const id = /^[A-Za-z0-9_-]{8,80}$/.test(supplied) ? supplied : crypto.randomUUID();
  const [seen] = await db.select({ id: messages.id }).from(messages).where(eq(messages.id, id)).limit(1);
  if (seen) return Response.json({ ok: true, id, duplicate: true, public: true });
  const createdAt = new Date().toISOString();
  await db.insert(messages).values({ id, type, name, contact, place, message, status, createdAt });

  if (status === "public") await mirrorMessages(db);

  return Response.json({ ok: true, id, public: status === "public" }, { status: 201 });
}

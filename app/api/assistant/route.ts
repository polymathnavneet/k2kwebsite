import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { journalEntries, journey, media, messages } from "@/db/schema";
import { buildAsks, remember } from "@/lib/assistant";
import { describe, understand } from "@/lib/understand";
import { acknowledge } from "@/lib/voice";
import { detectKind } from "@/lib/embed";
import { defaultJourney } from "@/lib/defaults";
import { mirrorMessages } from "@/lib/mirror";
import { promptForDay } from "@/lib/prompts";
import { clean, isAdmin, multiline, publicText } from "@/lib/server";
import { istDayKey } from "@/lib/time";
import { processPoints } from "@/lib/tracking";

/**
 * GET  /api/assistant -> what needs your attention, most urgent first
 * POST /api/assistant -> answer one, which performs the change
 *
 * Answering is the update. Nothing is filed away to be actioned later, because
 * a system that collects answers and then needs a second visit to apply them is
 * a system that gets abandoned in the first week.
 */

export async function GET(request: Request) {
  if (!isAdmin(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const db = getDb();
  const { asks, summary, opener } = await buildAsks(db);
  return Response.json({ asks, summary, opener, count: asks.length });
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
  const kind = clean(body.kind, 30);
  const context = (body.context ?? {}) as Record<string, unknown>;
  const answer = body.answer;
  const skipped = body.skip === true;

  if (skipped) {
    await remember(db, `skip:${kind}`, "skip", kind);
    return done(db, "Fine — I will ask less often.");
  }

  switch (kind) {
    /* ------------------------------------------------------- start walking */
    case "mode": {
      if (answer !== true) return done(db, "Left in preparation mode.");
      const [current] = await db.select().from(journey).where(eq(journey.id, 1)).limit(1);
      const next = { ...(current ?? { id: 1, ...defaultJourney }), id: 1, mode: "live", status: "Walking", updatedAt: new Date().toISOString() };
      await db.insert(journey).values(next).onConflictDoUpdate({ target: journey.id, set: next });
      return done(db, "The walk is live. Distance starts counting from your next position.");
    }

    /* ------------------------------------------------------ where you are */
    case "gps": {
      const lat = Number((answer as Record<string, unknown>)?.lat);
      const lon = Number((answer as Record<string, unknown>)?.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        return Response.json({ error: "That position did not come through. Try again." }, { status: 400 });
      }
      const accuracy = Number((answer as Record<string, unknown>)?.accuracy);
      const result = await processPoints(db, [{ lat, lon, accuracy: Number.isFinite(accuracy) ? accuracy : null }]);
      return done(db, result.reason, { journey: result.journey, suggestion: result.suggestion });
    }

    /* ------------------------------------------------ confirm a new place */
    case "suggestion": {
      const id = clean(context.suggestionId, 80);
      const url = new URL(request.url);
      const forward = await fetch(`${url.origin}/api/suggestions`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-admin-token": request.headers.get("x-admin-token") ?? "" },
        body: JSON.stringify({ id, action: answer === true ? "accept" : "dismiss" }),
      });
      const outcome = await forward.json().catch(() => ({}));
      if (!forward.ok) return Response.json(outcome, { status: forward.status });
      return done(db, answer === true
        ? `${clean(context.name, 80)} added to the route. Every date after it has recalculated.`
        : "Left off the route.");
    }

    /* --------------------------------------------------- reply to someone */
    case "reply": {
      const id = clean(context.messageId, 80);
      const reply = publicText(answer);
      if (!reply) return Response.json({ error: "Write a reply first." }, { status: 400 });
      await db.update(messages)
        .set({ reply, status: "public", repliedAt: new Date().toISOString() })
        .where(eq(messages.id, id));
      await mirrorMessages(db);
      return done(db, `Replied to ${clean(context.name, 60) || "them"}. It is on the wall now.`);
    }

    case "follow-up-reply": {
      const id = clean(context.messageId, 80);
      const reply = publicText(answer);
      if (!reply) return Response.json({ error: "Write a reply first." }, { status: 400 });
      await db.update(messages)
        .set({ followUpReply: reply, status: "public", followUpRepliedAt: new Date().toISOString() })
        .where(eq(messages.id, id));
      await mirrorMessages(db);
      return done(db, `Answered ${clean(context.name, 60) || "their"} follow-up. The two-answer conversation is complete.`);
    }

    /* ------------------------------------------------------- how was today */
    case "journal": {
      const text = multiline(answer, 1200);
      if (text.trim().length < 2) return Response.json({ error: "Tap something or write a line." }, { status: 400 });
      const [current] = await db.select().from(journey).where(eq(journey.id, 1)).limit(1);
      const mode = current?.mode ?? defaultJourney.mode;
      const day = /^\d{4}-\d{2}-\d{2}$/.test(String(context.day)) ? String(context.day) : istDayKey();
      const [existing] = await db.select({ id: journalEntries.id }).from(journalEntries).where(eq(journalEntries.day, day)).limit(1);
      const row = {
        id: existing?.id ?? crypto.randomUUID(),
        day,
        question: promptForDay(mode),
        body: text,
        place: current?.currentPlace ?? "",
        phase: mode === "live" ? "road" : "preparation",
        published: 1,
        createdAt: new Date().toISOString(),
      };
      if (existing) await db.update(journalEntries).set(row).where(eq(journalEntries.id, existing.id));
      else await db.insert(journalEntries).values(row);
      // Remember which shorthand he actually uses, so it rises to the top next time.
      for (const tapped of text.split(" · ").map(part => part.trim()).filter(Boolean).slice(0, 8)) {
        await remember(db, `tap:${tapped}`, "tap", tapped);
      }
      return done(db, acknowledge(existing ? "today's entry updated." : "that is on the journal."));
    }

    /* --------------------------------------------------- distance by hand */
    case "distance": {
      return done(db, "I did not add a typed distance. Walked kilometres come only from recorded GPS points, so the public total stays verifiable.");
    }

    /* ------------------------------------------------------- a picture */
    case "media": {
      const url = clean(answer, 500);
      const mediaKind = detectKind(url);
      if (!mediaKind) {
        return Response.json({ error: "That link is not one the site can show. Paste an Instagram post or reel, a YouTube video, or a direct image link." }, { status: 400 });
      }
      const [existing] = await db.select({ id: media.id }).from(media).where(eq(media.url, url)).limit(1);
      if (!existing) {
        await db.insert(media).values({
          id: crypto.randomUUID(), kind: mediaKind, url,
          caption: "", place: "", sortOrder: 0, createdAt: new Date().toISOString(),
        });
      }
      return done(db, existing ? "That one is already in the gallery." : "Added to the gallery.");
    }

    /* --------------------------------------------- anything typed at it */
    case "free": {
      const intent = understand(String(answer ?? ""));
      const understood = describe(intent);
      const url = new URL(request.url);
      const token = request.headers.get("x-admin-token") ?? "";
      const forward = (kindName: string, value: unknown, ctx: Record<string, unknown> = {}) =>
        fetch(`${url.origin}/api/assistant`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-admin-token": token },
          body: JSON.stringify({ kind: kindName, answer: value, context: ctx }),
        }).then(response => response.json());

      switch (intent.action) {
        case "media": return Response.json({ ...(await forward("media", intent.url)), understood });
        case "distance": return Response.json({ ...(await forward("distance", intent.km)), understood });
        case "mode": return Response.json(await forward("mode", true));

        case "remember": {
          await remember(db, `fact:${intent.fact.slice(0, 60)}`, "fact", intent.fact);
          return done(db, acknowledge("noted. I will keep that in mind."));
        }

        case "status": {
          const [current] = await db.select().from(journey).where(eq(journey.id, 1)).limit(1);
          const next = { ...(current ?? { id: 1, ...defaultJourney }), id: 1, status: intent.status, updatedAt: new Date().toISOString() };
          await db.insert(journey).values(next).onConflictDoUpdate({ target: journey.id, set: next });
          return done(db, acknowledge(`status is now ${intent.status.toLowerCase()}.`));
        }

        case "place":
          return done(db, `I did not change your location to ${intent.place}. Your public location comes only from GPS; use the GPS button if the tracker has not caught up.`);

        case "reply": {
          // Match the name against people actually waiting.
          const waiting = await db.select({ id: messages.id, name: messages.name }).from(messages).where(eq(messages.reply, "")).limit(50);
          const wanted = intent.who.toLowerCase();
          const target = waiting.find(row => row.name.toLowerCase().startsWith(wanted))
            ?? waiting.find(row => row.name.toLowerCase().includes(wanted));
          if (!target) {
            return done(db, `I could not find anyone called ${intent.who} waiting for a reply. Open the Messages tab to pick them.`);
          }
          return Response.json(await forward("reply", intent.text, { messageId: target.id, name: target.name }));
        }

        default: {
          const result = await forward("journal", intent.text, { day: istDayKey() });
          return Response.json({ ...result, understood });
        }
      }
    }

    default:
      return Response.json({ error: "I do not know how to do that one." }, { status: 400 });
  }
}

/** Answer, then immediately say what is still outstanding. */
async function done(db: ReturnType<typeof getDb>, said: string, extra: Record<string, unknown> = {}) {
  const { asks, summary, opener } = await buildAsks(db);
  return Response.json({ ok: true, said, asks, summary, opener, ...extra });
}

import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { routeConfig } from "@/db/schema";
import { defaultRoute } from "@/lib/defaults";
import { istDayKey, walkDay } from "@/lib/time";
import { walkOpensAt } from "@/lib/tracking";

/**
 * GET /api/days -> one row per day walked, oldest last.
 *
 * The site could say how far he had walked today and how far in total, and
 * nothing in between. Every day in the middle - the twenty-eight kilometre day
 * out of Madurai, the six kilometre day when his feet gave out - existed only
 * as a contribution to a running total nobody could take apart again. This is
 * the walk day by day.
 *
 * Nothing is stored. Every figure is added up from the recorded fixes on the
 * spot, the same as the totals are, so a day can never disagree with the total
 * it belongs to and removing a bad fix corrects both at once.
 *
 * The day boundary is India's midnight, not the reader's and not UTC: a fix at
 * 19:00 UTC belongs to the next Indian day, and a walk logged from London must
 * fall on the day Navneet actually walked it.
 */

const DEFAULT_DAYS = 30;
const MAX_DAYS = 400;

export async function GET(request: Request) {
  const db = getDb();
  const asked = Number(new URL(request.url).searchParams.get("days"));
  const limit = Number.isFinite(asked) && asked > 0 ? Math.min(MAX_DAYS, Math.round(asked)) : DEFAULT_DAYS;

  const [config] = await db.select().from(routeConfig).limit(1);
  const startDate = config?.startDate ?? defaultRoute.startDate;
  // Nothing before the first step, the same rule the totals follow. Fixes
  // banked before that rule existed are still in the table flagged as counted -
  // two of them, eight milliseconds apart, between them claiming fifty-seven
  // kilometres - and without this the section would have drawn a bar for a day
  // months before the walk began, contradicting every other figure on the page.
  const opensAt = walkOpensAt(startDate);

  // Grouped in SQL rather than by reading every fix into memory: a hundred and
  // eighty days of walking is tens of thousands of rows, and a public page must
  // not drag all of them across the wire to add them up.
  const rows = await db.all<{ day: string; km: number; fixes: number; firstAt: string; lastAt: string }>(sql`
    select
      date(${sql.identifier("recorded_at")}, '+5 hours', '30 minutes') as day,
      round(sum(${sql.identifier("counted_km")}), 2) as km,
      count(*) as fixes,
      min(${sql.identifier("recorded_at")}) as firstAt,
      max(${sql.identifier("recorded_at")}) as lastAt
    from ${sql.identifier("gps_points")}
    where ${sql.identifier("counted")} = 1
      and ${sql.identifier("recorded_at")} >= ${opensAt}
    group by day
    order by day desc
    limit ${limit}
  `);

  const today = istDayKey();
  const days = rows
    .map(row => ({
      day: row.day,
      km: Math.round((row.km ?? 0) * 10) / 10,
      fixes: row.fixes,
      // Which day of the walk this was, so the site can say "day 12" rather
      // than only a date.
      dayOfWalk: walkDay(startDate, new Date(`${row.day}T06:00:00+05:30`)),
      firstAt: row.firstAt,
      lastAt: row.lastAt,
      today: row.day === today,
    }))
    .reverse();

  const walked = days.filter(entry => entry.km > 0);
  const best = walked.reduce<(typeof days)[number] | null>((top, entry) => (!top || entry.km > top.km ? entry : top), null);
  const totalKm = Math.round(walked.reduce((sum, entry) => sum + entry.km, 0) * 10) / 10;

  return Response.json({
    days,
    summary: {
      daysWalked: walked.length,
      totalKm,
      // The average over days he actually walked, not over the calendar - a
      // rest day is not a day he managed four kilometres.
      averageKm: walked.length ? Math.round((totalKm / walked.length) * 10) / 10 : 0,
      best: best ? { day: best.day, km: best.km } : null,
    },
  });
}

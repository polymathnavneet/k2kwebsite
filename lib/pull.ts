import { eq } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "@/db/schema";
import { contentBlocks, journey, routeConfig, siteSettings, timelineSteps } from "@/db/schema";
import { fileId, parseCsv, parseSections, readDoc, readSheet } from "@/lib/google";
import { clean } from "@/lib/server";

type Db = DrizzleD1Database<typeof schema>;

/**
 * Running the site from a spreadsheet and a document.
 *
 * Navneet is not going to open an admin panel on a roadside in Madhya Pradesh.
 * He will open Google Docs, because it is already on his phone and it works on
 * one bar of signal. So the sheet and the document are the controls, the site
 * reads them on a timer, and nobody has to press anything.
 *
 * WHAT THESE FILES ARE ALLOWED TO CHANGE
 * A link-shared Google file is readable by anyone who has the link, and a link
 * is a thing that gets forwarded. So these files can change what is already
 * public - the status line, the dispatch, the start date, the prose on a page -
 * and they cannot touch anything that is not: no contact details, no book list,
 * no hiding of messages, no admin passcode. Losing the link costs a wrong
 * sentence on a public page, which Navneet can correct in the same sheet.
 *
 * Every value is validated here rather than trusted. A spreadsheet is a place
 * where somebody eventually types the wrong thing into the wrong row, and a
 * typo must not be able to tell the site the walk is 400,000 km long.
 */

export const SETTING_KEYS = { sheet: "control_sheet", doc: "content_doc", pulledAt: "last_pull_at", report: "last_pull_report" } as const;

/** The prose slots a document may fill. Anything else in the document is ignored. */
export const SLOTS = ["home-note", "about-extra", "sponsor-note", "book-note", "route-note", "journal-note"] as const;

/**
 * Settings a document may set, written the same way as everything else in it.
 *
 * The first version of this put them in a spreadsheet, and Navneet could not
 * use it: setting names, dates and paragraphs of instruction all stacked in
 * column A, which on a phone is a wall of text with nowhere obvious to type. He
 * writes prose all day. So a heading and a line underneath it, exactly like the
 * page text, and no spreadsheet needed at all.
 */
const DOC_SETTINGS: Record<string, string> = {
  status: "status", mode: "mode", "last-slept": "last slept", partner: "partner",
  "dispatch-title": "latest title", "dispatch-text": "latest text",
  "start-date": "start date", pace: "pace",
};

export type PullReport = { applied: string[]; ignored: string[]; problems: string[]; at: string };

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const norm = (value: string) => value.trim().toLowerCase().replace(/[\s_]+/g, " ");

export async function setting(db: Db, key: string) {
  const [row] = await db.select().from(siteSettings).where(eq(siteSettings.key, key)).limit(1);
  return row?.value ?? "";
}

export async function saveSetting(db: Db, key: string, value: string) {
  await db.insert(siteSettings).values({ key, value, updatedAt: new Date().toISOString() })
    .onConflictDoUpdate({ target: siteSettings.key, set: { value, updatedAt: new Date().toISOString() } });
}

/**
 * Read the sheet and the document, and make the site match them.
 *
 * Returns what changed, what was ignored and what was wrong, so the answer can
 * be shown to Navneet rather than disappearing into a log he will never open.
 */
export async function pull(db: Db): Promise<PullReport> {
  const report: PullReport = { applied: [], ignored: [], problems: [], at: new Date().toISOString() };

  const sheetId = fileId(await setting(db, SETTING_KEYS.sheet));
  const docId = fileId(await setting(db, SETTING_KEYS.doc));
  if (!sheetId && !docId) {
    report.problems.push("No control sheet or content document has been set yet.");
    return report;
  }

  if (sheetId) {
    try {
      await applySheet(db, await readSheet(sheetId), report);
    } catch (error) {
      report.problems.push(`Control sheet: ${error instanceof Error ? error.message : "could not be read"}`);
    }
  }

  if (docId) {
    try {
      await applyDoc(db, await readDoc(docId), report);
    } catch (error) {
      report.problems.push(`Content document: ${error instanceof Error ? error.message : "could not be read"}`);
    }
  }

  await saveSetting(db, SETTING_KEYS.pulledAt, report.at);
  await saveSetting(db, SETTING_KEYS.report, JSON.stringify(report));
  return report;
}

async function applySheet(db: Db, csv: string, report: PullReport) {
  const rows = parseCsv(csv);
  const values = new Map<string, string>();
  const plan: { date: string; title: string; detail: string }[] = [];

  let section = "settings";
  for (const row of rows) {
    const first = norm(row[0] ?? "");
    if (first === "before the walk" || first === "the plan") { section = "plan"; continue; }
    if (first === "settings" || first === "setting") { section = "settings"; continue; }

    if (section === "plan") {
      if (!DAY.test(row[0]?.trim() ?? "")) continue;
      plan.push({ date: row[0].trim(), title: clean(row[1], 120), detail: clean(row[2], 400) });
      continue;
    }
    if (first && row[1] !== undefined) values.set(first, String(row[1]).trim());
  }

  await applyJourney(db, values, report);
  await applyRoute(db, values, report);
  if (plan.length) await applyPlan(db, plan, report);
}

const STATUSES = ["Walking", "Resting", "Eating", "Sleeping", "Filming", "Need help"];

async function applyJourney(db: Db, values: Map<string, string>, report: PullReport) {
  const patch: Record<string, string> = {};

  const status = values.get("status");
  if (status) {
    const matched = STATUSES.find(known => known.toLowerCase() === status.toLowerCase());
    if (matched) patch.status = matched;
    else report.problems.push(`Status "${status}" is not one of: ${STATUSES.join(", ")}.`);
  }

  const mode = values.get("mode");
  if (mode) {
    if (["live", "preparation"].includes(mode.toLowerCase())) patch.mode = mode.toLowerCase();
    else report.problems.push(`Mode "${mode}" must be either live or preparation.`);
  }

  for (const [key, column, max] of [
    ["last slept", "lastSleep", 100], ["partner", "sponsorName", 100],
    ["latest title", "latestTitle", 140], ["latest text", "latestText", 500],
  ] as const) {
    const value = values.get(key);
    if (value !== undefined && value !== "") patch[column] = clean(value, max);
  }

  if (!Object.keys(patch).length) return;
  await db.update(journey).set(patch).where(eq(journey.id, 1));
  report.applied.push(`Journey: ${Object.keys(patch).join(", ")}`);
}

async function applyRoute(db: Db, values: Map<string, string>, report: PullReport) {
  const patch: Record<string, string | number> = {};

  const start = values.get("start date");
  if (start) {
    if (DAY.test(start)) patch.startDate = start;
    else report.problems.push(`Start date "${start}" must look like 2026-12-17.`);
  }

  const pace = values.get("pace");
  if (pace) {
    const number = Number(pace);
    // A typo here would quietly rewrite every arrival date on the route.
    if (Number.isFinite(number) && number >= 5 && number <= 60) patch.paceKmPerDay = number;
    else report.problems.push(`Pace "${pace}" must be a number between 5 and 60 km a day.`);
  }

  if (!Object.keys(patch).length) return;
  await db.update(routeConfig).set({ ...patch, updatedAt: new Date().toISOString() }).where(eq(routeConfig.id, 1));
  report.applied.push(`Route: ${Object.keys(patch).join(", ")}`);
}

async function applyPlan(db: Db, plan: { date: string; title: string; detail: string }[], report: PullReport) {
  const usable = plan.filter(step => step.title);
  if (usable.length < 1) return;
  usable.sort((a, b) => a.date.localeCompare(b.date));

  await db.delete(timelineSteps);
  await db.insert(timelineSteps).values(usable.map((step, index) => ({
    id: crypto.randomUUID(), day: step.date, title: step.title, detail: step.detail,
    sortOrder: index, isFinal: index === usable.length - 1 ? 1 : 0,
  })));

  // The last step is the day the walk starts, so the route follows it.
  const last = usable[usable.length - 1].date;
  const [config] = await db.select().from(routeConfig).where(eq(routeConfig.id, 1)).limit(1);
  if (config && config.startDate !== last) {
    await db.update(routeConfig).set({ startDate: last, updatedAt: new Date().toISOString() }).where(eq(routeConfig.id, 1));
    report.applied.push(`Before the walk: ${usable.length} steps, and the walk now starts ${last}`);
  } else {
    report.applied.push(`Before the walk: ${usable.length} steps`);
  }
}

async function applyDoc(db: Db, text: string, report: PullReport) {
  const sections = parseSections(text);
  if (!sections.size) {
    report.problems.push("The content document has no ## sections in it.");
    return;
  }

  // Settings first: a heading with one line under it, same as everything else.
  const values = new Map<string, string>();
  for (const [heading, key] of Object.entries(DOC_SETTINGS)) {
    const body = sections.get(heading);
    if (body !== undefined && body.trim()) values.set(key, body.trim().split(/\r?\n/)[0].trim());
  }
  if (values.size) {
    await applyJourney(db, values, report);
    await applyRoute(db, values, report);
  }

  // Then the run-up, one step a line: date | what it is | why it matters.
  const plan = sections.get("before-the-walk");
  if (plan?.trim()) {
    const steps = plan.split(/\r?\n/).map(line => line.split("|").map(part => part.trim()))
      .filter(parts => DAY.test(parts[0] ?? ""))
      .map(parts => ({ date: parts[0], title: clean(parts[1], 120), detail: clean(parts[2], 400) }));
    if (steps.length) await applyPlan(db, steps, report);
    else report.problems.push("No usable dates under ## before-the-walk. Each line needs to start 2026-12-17 followed by a | .");
  }

  const written: string[] = [];
  for (const [slot, body] of sections) {
    if (handledAbove(slot)) continue;
    if (!(SLOTS as readonly string[]).includes(slot)) { report.ignored.push(`## ${slot}`); continue; }
    const value = body.slice(0, 4000);
    await db.insert(contentBlocks).values({ slot, body: value, updatedAt: new Date().toISOString() })
      .onConflictDoUpdate({ target: contentBlocks.slot, set: { body: value, updatedAt: new Date().toISOString() } });
    written.push(slot);
  }
  if (written.length) report.applied.push(`Page text: ${written.join(", ")}`);
}

/** Headings handled above, so they are not also reported as unknown slots. */
function handledAbove(slot: string) {
  return slot === "before-the-walk" || Object.keys(DOC_SETTINGS).includes(slot);
}

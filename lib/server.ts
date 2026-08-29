import { env } from "cloudflare:workers";

export function isAdmin(request: Request) {
  const runtime = env as unknown as { ADMIN_TOKEN?: string };
  const expected = runtime.ADMIN_TOKEN?.trim() ?? "";
  const supplied = request.headers.get("x-admin-token")?.trim() ?? "";
  return Boolean(expected && supplied && supplied === expected);
}

/**
 * A phone app posting positions by itself, rather than Navneet in the admin
 * panel.
 *
 * A tracking app cannot be handed the admin passcode: it has to be typed into a
 * settings box on a phone, it travels in a URL, and anything that leaks it
 * would then own the whole site. TRACK_KEY is a separate value that can do
 * exactly one thing - add positions - so losing it costs a false dot on a map
 * and nothing else. Change it and the old one stops working.
 *
 * Accepted in the query string as well as a header, because most tracker apps
 * only offer a URL box.
 */
export function isTracker(request: Request) {
  const runtime = env as unknown as { TRACK_KEY?: string };
  const expected = runtime.TRACK_KEY?.trim() ?? "";
  if (expected.length < 12) return false;
  const url = new URL(request.url);
  const supplied = (url.searchParams.get("key") ?? request.headers.get("x-track-key") ?? "").trim();
  if (supplied.length !== expected.length) return false;
  // Compare every character regardless, so a wrong key cannot be narrowed down
  // by how quickly it is rejected.
  let same = 0;
  for (let index = 0; index < expected.length; index += 1) same |= expected.charCodeAt(index) ^ supplied.charCodeAt(index);
  return same === 0;
}

export function clean(value: unknown, max = 500) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, max);
}

/**
 * Like clean, but keeps paragraphs.
 *
 * The public wall is styled to preserve line breaks, so collapsing them
 * server-side turned everything a visitor wrote into one block. Runs of blank
 * lines are still capped, and trailing spaces on a line are dropped.
 */
export function multiline(value: unknown, max = 1200) {
  return String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max);
}

export function publicText(value: unknown) {
  return multiline(value, 1200)
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[contact hidden]")
    .replace(/(?:\+?91[\s-]?)?[6-9](?:[\s-]?\d){9}\b/g, "[contact hidden]");
}

export function clamp(value: unknown, min: number, max: number, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

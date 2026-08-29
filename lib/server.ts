import { env } from "cloudflare:workers";

export function isAdmin(request: Request) {
  const runtime = env as unknown as { ADMIN_TOKEN?: string };
  const expected = runtime.ADMIN_TOKEN?.trim() ?? "";
  const supplied = request.headers.get("x-admin-token")?.trim() ?? "";
  return Boolean(expected && supplied && supplied === expected);
}

export function clean(value: unknown, max = 500) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, max);
}

export function publicText(value: unknown) {
  return clean(value, 1200)
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[contact hidden]")
    .replace(/(?:\+?91[\s-]?)?[6-9](?:[\s-]?\d){9}\b/g, "[contact hidden]");
}

export function clamp(value: unknown, min: number, max: number, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

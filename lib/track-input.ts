import type { TrackPoint } from "@/lib/tracking";

export function readNumber(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function readTimestamp(value: unknown, unit: "auto" | "seconds" | "milliseconds" = "auto"): string | null {
  if (value == null || value === "") return null;
  const number = readNumber(value);
  const milliseconds = number === null ? Date.parse(String(value))
    : unit === "seconds" || (unit === "auto" && Math.abs(number) < 1e11) ? number * 1000 : number;
  if (!Number.isFinite(milliseconds) || Math.abs(milliseconds) > 8.64e15 || milliseconds > Date.now() + 300000) return null;
  return new Date(milliseconds).toISOString();
}

export function readPoint(value: unknown): TrackPoint | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  const lat = readNumber(item.lat), lon = readNumber(item.lon ?? item.lng);
  if (lat === null || lon === null || lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  const at = readTimestamp(item.at);
  if (item.at != null && !at) return null;
  const suppliedAccuracy = item.accuracy ?? item.acc;
  const accuracy = readNumber(suppliedAccuracy);
  if (suppliedAccuracy != null && (accuracy === null || accuracy < 0)) return null;
  return { lat, lon, at: at ?? undefined, accuracy };
}

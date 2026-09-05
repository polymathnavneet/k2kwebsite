import type { Journey } from "./types";

/** Refresh phone readings without replacing an unfinished admin note. */
export function mergeLiveTelemetry(current: Journey, incoming: Journey): Journey {
  const { status, lastSleep, latestTitle, latestText, latestUrl, sponsorName } = current;
  if (current.updatedAt && incoming.updatedAt && Date.parse(incoming.updatedAt) < Date.parse(current.updatedAt)) return current;
  return { ...current, ...incoming, status, lastSleep, latestTitle, latestText, latestUrl, sponsorName };
}

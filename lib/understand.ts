import { detectKind } from "@/lib/embed";

/**
 * Working out what a typed line means.
 *
 * "walked 18k today", "in nagpur now", an Instagram link pasted on its own,
 * "reply to priya: thank you" - all of these are things a person types when
 * they cannot be bothered to find the right screen. Understanding them is what
 * makes the assistant usable one-handed at the end of a long day.
 *
 * Deliberately conservative: when it is not confident, the line becomes a
 * journal entry rather than a guessed action. Writing a sentence into the
 * journal by mistake is recoverable; silently changing the route is not.
 */

export type Intent =
  | { action: "media"; url: string }
  | { action: "distance"; km: number }
  | { action: "place"; place: string }
  | { action: "reply"; who: string; text: string }
  | { action: "mode"; live: boolean }
  | { action: "remember"; fact: string }
  | { action: "status"; status: string }
  | { action: "journal"; text: string };

const DISTANCE = /(?:^|\b)(?:walked|did|covered|done)?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:km|kms|kilometres|kilometers|k)\b/i;
const PLACE = /\b(?:i(?:'m| am)? |now )?(?:in|at|reached|arrived (?:in|at)|reaching)\s+([A-Za-z][A-Za-z\s.'-]{1,40}?)(?:\s+now)?\s*[.!]?$/i;
const REPLY = /^(?:reply|respond|answer)\s+(?:to\s+)?([A-Za-z][\w\s.'-]{0,40}?)\s*[:,-]\s*([\s\S]+)$/i;
const REMEMBER = /^(?:remember|note|keep in mind)(?:\s+that)?\s*[:,-]?\s*([\s\S]+)$/i;
const START = /^(?:i(?:'ve| have)?\s*)?(?:started|start|begun|begin|going live|go live)(?:\s+the\s+walk)?\s*[.!]?$/i;
const STATUS = /^(?:i(?:'m| am)\s+)?(walking|resting|eating|sleeping|filming|need help)\b/i;

/** Words that mean a distance is training rather than a place name. */
const NOT_A_PLACE = /^(the|a|an|it|this|that|here|there|home|bed|rest|pain|trouble|touch|last|least|all|least)\b/i;

export function understand(input: string): Intent {
  const text = String(input ?? "").trim();
  if (!text) return { action: "journal", text: "" };

  // A pasted link is unambiguous, wherever it appears in the line.
  const link = text.match(/https?:\/\/\S+/i)?.[0];
  if (link && detectKind(link)) return { action: "media", url: link };

  const remember = text.match(REMEMBER);
  if (remember) return { action: "remember", fact: remember[1].trim() };

  const reply = text.match(REPLY);
  if (reply) return { action: "reply", who: reply[1].trim(), text: reply[2].trim() };

  if (START.test(text)) return { action: "mode", live: true };

  const status = text.match(STATUS);
  // Only when that is the whole line - "walking was hard today" is a diary entry.
  if (status && text.length <= status[1].length + 12) {
    const word = status[1].toLowerCase();
    return { action: "status", status: word.charAt(0).toUpperCase() + word.slice(1) };
  }

  // A distance on its own, or with a couple of words around it.
  const distance = text.match(DISTANCE);
  if (distance && text.split(/\s+/).length <= 6) {
    const km = Number(distance[1]);
    if (Number.isFinite(km) && km > 0 && km <= 100) return { action: "distance", km };
  }

  const place = text.match(PLACE);
  if (place && text.split(/\s+/).length <= 6) {
    const name = place[1].trim().replace(/\s+/g, " ");
    if (!NOT_A_PLACE.test(name) && name.length >= 3) return { action: "place", place: name };
  }

  // Anything else is what happened today.
  return { action: "journal", text };
}

/** A short, plain confirmation of what an intent will do, for the reply line. */
export function describe(intent: Intent) {
  switch (intent.action) {
    case "media": return "Adding that to the gallery.";
    case "distance": return `Adding ${intent.km} km.`;
    case "place": return `Noting you are in ${intent.place}.`;
    case "reply": return `Replying to ${intent.who}.`;
    case "mode": return "Switching the walk to live.";
    case "remember": return "Noted.";
    case "status": return `Status set to ${intent.status}.`;
    default: return "Writing that into the journal.";
  }
}

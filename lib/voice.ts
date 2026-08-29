import { WALK_TIMEZONE } from "@/lib/time";

/**
 * How the assistant talks.
 *
 * The point is not personality for its own sake. A line that knows it is
 * half past nine at night, that yesterday was 31 km, and that nobody has
 * written anything for three days reads like someone paying attention, and
 * someone paying attention gets answered. A flat "1 item requires input" does
 * not.
 *
 * Every line here is assembled from facts the site already holds, so it can
 * never claim something untrue.
 */

/** The hour in India, whatever clock the reader's phone is on. */
export function istHour(date = new Date()) {
  return Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: WALK_TIMEZONE }).format(date));
}

export function greeting(date = new Date()) {
  const hour = istHour(date);
  if (hour < 5) return "Still up";
  if (hour < 12) return "Morning";
  if (hour < 17) return "Afternoon";
  if (hour < 21) return "Evening";
  return "Late one";
}

type Facts = {
  live: boolean;
  day: number;
  place?: string;
  fixAgeHours: number | null;
  waiting: number;
  daysSinceEntry: number | null;
  yesterdayKm?: number | null;
  todayKm?: number;
};

/** The opening line: what the site actually knows, said plainly. */
export function opener(facts: Facts, date = new Date()) {
  const hello = greeting(date);

  if (!facts.live) {
    if (facts.daysSinceEntry !== null && facts.daysSinceEntry > 3) {
      return `${hello}. Nothing written for ${facts.daysSinceEntry} days — how is the preparation going?`;
    }
    return `${hello}. Still counting down to the start.`;
  }

  if (facts.fixAgeHours !== null && facts.fixAgeHours > 40) {
    return `${hello}. The map has not moved in ${Math.round(facts.fixAgeHours / 24)} days — everyone reading is wondering where you are.`;
  }
  if (facts.todayKm && facts.todayKm > 0) {
    return `${hello}. ${facts.todayKm} km on the board today${facts.place ? `, and you are in ${facts.place}` : ""}.`;
  }
  if (facts.yesterdayKm && facts.yesterdayKm > 0) {
    return `${hello}. Yesterday was ${facts.yesterdayKm} km. Nothing recorded yet today.`;
  }
  return `${hello}. Day ${facts.day}${facts.place ? `, ${facts.place}` : ""}.`;
}

/** What to say after something was done, so it does not read like a receipt. */
export function acknowledge(what: string, extra?: string) {
  const openers = ["Done —", "Good —", "Right —"];
  const pick = openers[Math.floor(Date.now() / 60000) % openers.length];
  return [`${pick} ${what}`, extra].filter(Boolean).join(" ");
}

/** A nudge that names the actual cost of not answering. */
export function why(kind: string, facts: Facts) {
  switch (kind) {
    case "gps":
      return facts.fixAgeHours && facts.fixAgeHours > 40
        ? "The public map is showing a position that is days old."
        : "The map and every arrival date follow from this.";
    case "reply":
      return facts.waiting > 1
        ? `${facts.waiting} people are waiting to hear back.`
        : "Somebody took the trouble to write.";
    case "journal":
      return facts.daysSinceEntry && facts.daysSinceEntry > 2
        ? `The journal has been quiet for ${facts.daysSinceEntry} days.`
        : "Two taps is enough.";
    case "mode":
      return "Until this is switched, nothing counts distance.";
    default:
      return "";
  }
}

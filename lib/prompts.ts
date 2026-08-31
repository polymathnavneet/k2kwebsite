/**
 * The question the admin panel asks each day.
 *
 * One specific question beats a blank box. "What did you do today?" gets
 * "training" and nothing else; "What hurt today, and what did you do about it?"
 * gets a paragraph worth reading. Every one of these can be answered honestly
 * in two minutes standing up.
 *
 * The question is chosen by the date, so it is the same all day, changes at
 * midnight, and does not repeat until the list runs out.
 */

import { istDayKey } from "@/lib/time";

export const PREPARATION_PROMPTS = [
  "What did you do today to get ready, and how did it go?",
  "What is the one thing you still have not sorted out?",
  "What did you spend money on this week, and was it worth it?",
  "How did today's training feel, and what did it teach you?",
  "What piece of kit are you still unsure about?",
  "Who did you talk to about the walk today, and what did they say?",
  "What are you most afraid of about the first week?",
  "What did you learn today that you did not know yesterday?",
  "What did you eat today, and would it work on the road?",
  "What is going better than you expected?",
  "What did you carry today, and what would you leave behind?",
  "What part of the route are you least sure about?",
  "What made you doubt this today?",
  "Who is helping, and what are they doing?",
  "What did you fix, mend or replace today?",
  "How is the writing going?",
  "What do you want to ask people once you are walking?",
  "What would make tomorrow a good day?",
];

export const ROAD_PROMPTS = [
  "Where did you sleep last night, and how was it?",
  "Who did you meet today?",
  "What hurt today, and what did you do about it?",
  "What did you eat, and who gave it to you?",
  "What was the road like today?",
  "What did you see that you did not expect?",
  "What was the hardest hour of today?",
  "Who helped you today without being asked?",
  "What is the weather doing to you?",
  "What did you photograph today, and why that?",
  "What did somebody say today that stayed with you?",
  "What are you carrying that you no longer need?",
  "How are your feet, honestly?",
  "What did you walk past that you wish you had stopped for?",
  "What is the next town, and what do you know about it?",
  "What made you laugh today?",
  "What do you miss today?",
  "What would you tell someone starting this walk tomorrow?",
];

/** Whole days since 1970 in Indian time, so the question turns over at midnight in India. */
function dayNumber(date: Date) {
  return Math.floor(new Date(istDayKey(date)).getTime() / 86400000);
}

export function promptForDay(mode: string, date = new Date()) {
  const list = mode === "live" ? ROAD_PROMPTS : PREPARATION_PROMPTS;
  return list[Math.abs(dayNumber(date)) % list.length];
}

/** Today as YYYY-MM-DD in India, so a day is the same day for everyone. */
export const todayKey = istDayKey;

/**
 * Things to tap.
 *
 * A blank box at the end of a hard day gets nothing written in it. A row of
 * buttons gets tapped. Two or three taps make a real entry, and the typing is
 * optional on top rather than the whole job.
 */
export type TapGroup = { group: string; options: string[] };

export const PREPARATION_TAPS: TapGroup[] = [
  { group: "Training", options: ["Training walk", "Walked with full pack", "Strength work", "Mobility work", "Rest day"] },
  { group: "Kit", options: ["Broke in shoes", "Tested the pack", "Bought kit", "Repaired something", "Still deciding on kit"] },
  { group: "Groundwork", options: ["Route research", "Talked to a sponsor", "Talked to press", "Wrote", "Filmed", "Sorted paperwork"] },
  { group: "Body", options: ["Feet fine", "Blisters", "Sore legs", "Something hurts", "Slept badly", "Felt strong"] },
  { group: "Head", options: ["Confident", "Nervous", "Impatient to start", "Doubting it", "Grateful"] },
];

export const ROAD_TAPS: TapGroup[] = [
  { group: "The day", options: ["Long day", "Short day", "Rest day", "Started before dawn", "Walked into the night", "Stopped early"] },
  { group: "The road", options: ["Highway", "Village road", "Hills", "Heat", "Rain", "Traffic was bad", "Beautiful stretch"] },
  { group: "People", options: ["Someone fed me", "Someone gave me a bed", "Walked with company", "Long conversation", "Filmed someone"] },
  { group: "Body", options: ["Feet fine", "Blisters", "Sore legs", "Something hurts", "Slept well", "Slept badly"] },
  { group: "Head", options: ["Good day", "Hard day", "Bored", "Homesick", "Grateful", "Would do it again"] },
];

export function tapsForMode(mode: string) {
  return mode === "live" ? ROAD_TAPS : PREPARATION_TAPS;
}

/**
 * Reading a Google sheet and a Google document from the outside.
 *
 * Both can be fetched as plain text without a key or a login, provided the file
 * is shared so that anyone with the link can view it. That is the whole trick:
 * no OAuth, no service account, nothing to expire in the middle of a walk.
 *
 * A link-shared file is readable by anybody who has the link, so nothing
 * private is ever read through here - see the note in lib/pull.ts about what
 * these files are allowed to change.
 */

/** Pull a file id out of whatever Google put in the address bar. */
export function fileId(url: string) {
  const match = String(url ?? "").match(/\/d\/(?:e\/)?([A-Za-z0-9_-]{20,})/);
  return match ? match[1] : "";
}

const SHEET = (id: string) => `https://docs.google.com/spreadsheets/d/${id}/export?format=csv`;
const DOC = (id: string) => `https://docs.google.com/document/d/${id}/export?format=txt`;

async function readText(url: string) {
  const response = await fetch(url, {
    redirect: "follow",
    headers: { "user-agent": "a-long-walk (site sync)" },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`Google answered ${response.status}. Is the file shared so anyone with the link can view it?`);
  const text = await response.text();
  // A file that is not shared answers with a sign-in page rather than an error.
  if (/<html/i.test(text.slice(0, 200))) throw new Error("Google returned a sign-in page. Set the file to 'Anyone with the link · Viewer'.");
  return text;
}

export const readSheet = (id: string) => readText(SHEET(id));
export const readDoc = (id: string) => readText(DOC(id));

/**
 * A CSV parser that survives a spreadsheet.
 *
 * Somebody typing prose into a cell will eventually type a comma, a quotation
 * mark and a line break, and splitting on commas would quietly shear the sheet
 * apart at exactly that point. This walks the text instead.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') { cell += '"'; index += 1; }
        else quoted = false;
      } else cell += character;
      continue;
    }

    if (character === '"') quoted = true;
    else if (character === ",") { row.push(cell); cell = ""; }
    else if (character === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (character !== "\r") cell += character;
  }

  row.push(cell);
  rows.push(row);
  return rows.filter(line => line.some(value => value.trim() !== ""));
}

/**
 * Split a document into named sections.
 *
 * A line of the form "## slot-name" starts a section; everything until the next
 * one is its body. Anything before the first heading is ignored, which is where
 * the instructions live.
 */
export function parseSections(text: string) {
  const sections = new Map<string, string>();
  let slot = "";
  let body: string[] = [];

  const flush = () => {
    if (slot) sections.set(slot, body.join("\n").trim());
    body = [];
  };

  for (const line of text.split(/\r?\n/)) {
    const heading = line.match(/^\s*##\s*([a-z0-9-]{2,40})\s*$/i);
    if (heading) { flush(); slot = heading[1].toLowerCase(); }
    else if (slot) body.push(line);
  }
  flush();
  return sections;
}

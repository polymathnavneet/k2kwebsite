import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import ts from "typescript";

const src = readFileSync("lib/google.ts", "utf8").replace(/^import .*$/gm, "");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { parseCsv, parseSections, fileId } = await import("data:text/javascript," + encodeURIComponent(js));

// --- a spreadsheet somebody actually typed into ---------------------------
// Prose in a cell eventually contains a comma, a quotation mark and a line
// break. Splitting on commas would shear the sheet apart at exactly that row.
const rows = parseCsv(
  'setting,value\r\n' +
  'status,Walking\r\n' +
  '"latest text","Left Bettiah at dawn, and the road was quiet.\nA man gave me tea."\r\n' +
  '"partner","""Boots"" and co"\r\n' +
  '\r\n' +
  'pace,25\r\n'
);
assert.equal(rows[1][1], "Walking");
assert.equal(rows[2][1], "Left Bettiah at dawn, and the road was quiet.\nA man gave me tea.", "a comma and a line break inside a cell stay inside it");
assert.equal(rows[3][1], '"Boots" and co', "doubled quotes come back as one");
assert.equal(rows[4][0], "pace", "a blank row does not shift everything down");
console.log("  csv       commas, quotes, line breaks and blank rows survive");

// --- the document -------------------------------------------------------
const sections = parseSections([
  "These are instructions and must never reach the site.",
  "## home-note",
  "First paragraph.",
  "",
  "Second paragraph.",
  "## About-Extra",
  "Something about me.",
  "## not-a-real-slot",
  "Ignored later, but still parsed.",
].join("\n"));
assert.equal(sections.get("home-note"), "First paragraph.\n\nSecond paragraph.");
assert.equal(sections.get("about-extra"), "Something about me.", "headings are matched whatever the case");
assert.ok(!sections.has(""), "the preamble is not a section");
console.log("  document  sections split, preamble ignored, case does not matter");

// --- ids out of whatever Google put in the address bar --------------------
for (const [url, expected] of [
  ["https://docs.google.com/document/d/1_8XcpKt2B2Q22yeFG-1NspxfbQgeMyQ5ImBbwMF2zw0/edit", "1_8XcpKt2B2Q22yeFG-1NspxfbQgeMyQ5ImBbwMF2zw0"],
  ["https://docs.google.com/spreadsheets/d/11JR-NPTUA1UN6u1tkO-3g1kdjEK3mU_1fmEhNVydJoY/edit?usp=drivesdk", "11JR-NPTUA1UN6u1tkO-3g1kdjEK3mU_1fmEhNVydJoY"],
  ["https://docs.google.com/spreadsheets/d/e/2PACX-1vTESTTESTTESTTESTTEST/pubhtml", "2PACX-1vTESTTESTTESTTESTTEST"],
  ["not a link at all", ""],
]) assert.equal(fileId(url), expected, url);
console.log("  links     edit links, share links, published links and rubbish");

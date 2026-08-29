import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import ts from "typescript";

// Transpile lib/github.ts for real, only stubbing the Cloudflare env import.
const source = readFileSync("lib/github.ts", "utf8")
  .replace(/^import \{ env \} from "cloudflare:workers";$/m, "const env = new Proxy({}, { get: (_t, k) => globalThis.__env[k] });");
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;

globalThis.__env = { GITHUB_TOKEN: "fake", GITHUB_REPO: "owner/repo" };

const store = { "data/route.json": { content: { title: "A Long Walk", stops: [] }, sha: "s1" } };
let writes = 0;
globalThis.fetch = async (url, options = {}) => {
  const method = options.method || "GET";
  const path = decodeURIComponent(new URL(url).pathname.replace("/repos/owner/repo/contents/", ""));
  if (method === "GET") {
    const entry = store[path];
    if (!entry) return new Response("{}", { status: 404 });
    return new Response(JSON.stringify({
      content: Buffer.from(JSON.stringify(entry.content, null, 2) + "\n", "utf8").toString("base64"),
      sha: entry.sha,
    }), { status: 200 });
  }
  writes++;
  const body = JSON.parse(options.body);
  assert.ok(body.message.endsWith("[skip ci]"), "commits must carry [skip ci]");
  assert.equal(body.branch, "main");
  store[path] = { content: JSON.parse(Buffer.from(body.content, "base64").toString("utf8")), sha: "s" + writes };
  return new Response(JSON.stringify({ content: { sha: store[path].sha } }), { status: 200 });
};

const gh = await import("data:text/javascript," + encodeURIComponent(js));

assert.equal(gh.githubEnabled(), true);
const read = await gh.readData("route");
console.log("read ->", JSON.stringify(read.data), "| sha", read.sha);
assert.equal(read.data.title, "A Long Walk");

const payload = { title: "A Long Walk", startDate: "2026-12-17", stops: [{ name: "Kanyakumari", note: "Kanyakumari → Kashmir · नमस्ते" }] };
assert.equal(await gh.writeData("route", payload, "Update the route"), true);
console.log("wrote ->", JSON.stringify(store["data/route.json"].content.stops[0].note));
assert.equal(store["data/route.json"].content.stops[0].note, "Kanyakumari → Kashmir · नमस्ते", "unicode must survive");
assert.equal(writes, 1);
console.log("✓ round trip keeps → and Devanagari intact, commit carries [skip ci]");

assert.equal(await gh.writeData("route", payload, "Update the route"), true);
assert.equal(writes, 1, "an unchanged file must not be re-committed");
console.log("✓ unchanged file not re-committed (still", writes, "commit)");

assert.deepEqual(await gh.readData("messages"), { data: null, sha: null });
console.log("✓ missing file reads as null, does not throw");

globalThis.__env = {};
assert.equal(gh.githubEnabled(), false);
assert.equal(await gh.writeData("route", payload, "x"), false);
assert.equal(writes, 1);
console.log("✓ no GITHUB_TOKEN: bridge off cleanly, site unaffected");

globalThis.__env = { GITHUB_TOKEN: "fake", GITHUB_REPO: "owner/repo" };
globalThis.fetch = async () => { throw new Error("network down"); };
assert.equal(await gh.writeData("route", payload, "x"), false, "an outage must not throw into the request");
console.log("✓ GitHub outage swallowed - a visitor's message is never lost\n");
// --- reading with NO token must use the plain public file --------------------
// The authenticated Contents API refuses anonymous calls from shared hosting
// with a 403, so the no-token path must not touch it at all. This is exactly
// the bug that shipped: the helper existed but the read never used it.
globalThis.__env = { GITHUB_REPO: "owner/repo" };
const seen = [];
globalThis.fetch = async (url) => {
  seen.push(String(url));
  if (String(url).startsWith("https://raw.githubusercontent.com/")) {
    return new Response(JSON.stringify({ title: "A Long Walk", stops: [{ name: "Kanyakumari" }] }), { status: 200 });
  }
  return new Response("forbidden", { status: 403 });
};

const anon = await gh.readData("route");
console.log("  no-token read fetched:", seen[0]);
assert.equal(seen.length, 1, "a no-token read should make exactly one request");
assert.ok(seen[0].startsWith("https://raw.githubusercontent.com/owner/repo/main/data/route.json"),
  `no-token read must use the raw public file, got ${seen[0]}`);
assert.ok(!seen[0].includes("api.github.com"), "a no-token read must never call the authenticated API");
assert.equal(anon.data.title, "A Long Walk");
assert.equal(anon.sha, null, "there is no sha without the API, and none is needed to read");
console.log("✓ with no token, reads go to the plain public file and never to the authenticated API");

// A missing file still reads as null on that path.
globalThis.fetch = async () => new Response("Not Found", { status: 404 });
assert.deepEqual(await gh.readData("messages"), { data: null, sha: null });
console.log("✓ a missing file still reads as null with no token\n");

console.log("ALL GITHUB BRIDGE CHECKS PASSED");

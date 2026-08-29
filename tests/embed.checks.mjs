import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import ts from "typescript";

const src = readFileSync("lib/embed.ts", "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { detectKind, embedUrl, INSTAGRAM_URL } = await import("data:text/javascript," + encodeURIComponent(js));

// Real link shapes people actually copy from the share sheet.
const cases = [
  ["https://www.instagram.com/p/C8xYzAbCdEf/", "instagram", "https://www.instagram.com/p/C8xYzAbCdEf/embed"],
  ["https://instagram.com/reel/C8xYzAbCdEf/?igsh=abc123", "instagram", "https://www.instagram.com/p/C8xYzAbCdEf/embed"],
  ["https://www.instagram.com/reels/C8xYzAbCdEf/", "instagram", "https://www.instagram.com/p/C8xYzAbCdEf/embed"],
  ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "youtube", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"],
  ["https://youtu.be/dQw4w9WgXcQ?t=42", "youtube", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"],
  ["https://www.youtube.com/shorts/dQw4w9WgXcQ", "youtube", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"],
  ["https://example.com/photo.jpg", "image", null],
  ["https://example.com/photo.JPEG?v=2", "image", null],
];

for (const [url, kind, embed] of cases) {
  assert.equal(detectKind(url), kind, `${url} should be ${kind}`);
  assert.equal(embedUrl(kind, url), embed, `${url} embed URL`);
  console.log(`  ${kind.padEnd(10)} ${url.slice(0, 52)}`);
}
console.log("✓ every share-sheet link shape is recognised and turned into an embed");

// Things that must be refused rather than shown as a broken box.
for (const bad of [
  "https://www.instagram.com/polymath_navneet/",   // a profile, not a post
  "https://example.com/page.html",
  "not a url at all",
  "",
  "javascript:alert(1)",
]) {
  assert.equal(detectKind(bad), null, `${bad} must be refused`);
}
console.log("✓ profiles, plain pages and junk are refused, not rendered as a broken frame");

assert.equal(INSTAGRAM_URL, "https://www.instagram.com/polymath_navneet/");
console.log("✓ the Instagram account is wired to @polymath_navneet\n");
console.log("ALL MEDIA LINK CHECKS PASSED");

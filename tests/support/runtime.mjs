import { build } from "esbuild";
import { DatabaseSync } from "node:sqlite";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

// Execute the real handlers and Drizzle queries against SQLite. Only the
// Cloudflare binding is substituted; application logic is bundled unchanged.
export async function runtime(entries) {
  const directory = await mkdtemp(path.join(tmpdir(), "alw-tests-"));
  const sqlite = new DatabaseSync(":memory:");
  for (const file of (await readdir("drizzle")).filter(file => file.endsWith(".sql")).sort()) {
    sqlite.exec(await readFile(path.join("drizzle", file), "utf8"));
  }
  const binding = {
    prepare(query) {
      const statement = sqlite.prepare(query);
      let args = [];
      return {
        bind(...values) { args = values; return this; },
        async all() { return { results: statement.all(...args), success: true }; },
        async raw() { statement.setReturnArrays(true); return statement.all(...args); },
        async first(column) { const row = statement.get(...args); return column ? row?.[column] ?? null : row ?? null; },
        async run() { return { success: true, meta: statement.run(...args) }; },
      };
    },
    async batch(statements) {
      sqlite.exec("BEGIN");
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.all());
        sqlite.exec("COMMIT");
        return results;
      } catch (error) { sqlite.exec("ROLLBACK"); throw error; }
    },
  };
  const key = `__alwTest_${crypto.randomUUID().replaceAll("-", "")}`;
  const env = { DB: binding, ADMIN_TOKEN: "test-admin", TRACK_KEY: "test-tracker-key-12345" };
  globalThis[key] = env;
  const entry = entries.map((file, i) => `export * as module${i} from ${JSON.stringify(path.resolve(file))};`).join("\n");
  const outfile = path.join(directory, "runtime.mjs");
  await build({
    stdin: { contents: entry, resolveDir: process.cwd(), loader: "ts" },
    outfile, bundle: true, platform: "node", format: "esm", target: "node22",
    plugins: [{ name: "test-binding", setup(build) {
      build.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: "binding", namespace: "test" }));
      build.onLoad({ filter: /.*/, namespace: "test" }, () => ({ contents: `export const env = globalThis[${JSON.stringify(key)}];` }));
    } }],
  });
  const modules = await import(pathToFileURL(outfile).href);
  return {
    sqlite, env, binding,
    modules: entries.map((_, i) => modules[`module${i}`]),
    async close() { sqlite.close(); delete globalThis[key]; await rm(directory, { recursive: true, force: true }); },
  };
}

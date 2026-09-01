/**
 * Prepares the built site for a deploy to Navneet's own Cloudflare account.
 *
 * The build writes dist/server/wrangler.json with a placeholder database id,
 * because the Sites runtime injects the real one at publish time. Deploying
 * ourselves means filling that in with the values resolve-cloudflare.mjs worked
 * out from the account. Nothing here touches .openai/hosting.json, so the Sites
 * publish keeps working exactly as it does today.
 */
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { routesFor } from "./domain.mjs";

const root = process.cwd();
const built = resolve(root, "dist", "server", "wrangler.json");

const databaseId = required("CF_D1_ID");
const databaseName = required("CF_D1_NAME");
const workerName = process.env.CF_WORKER_NAME?.trim();

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`Missing ${name}. The "Work out where this is going" step should have set it.`);
    process.exit(78);
  }
  return value;
}

const config = JSON.parse(await readFile(built, "utf8"));

if (workerName) {
  config.name = workerName;
  config.topLevelName = workerName;
}

// Give the worker a real database, and a public *.workers.dev address so the
// site can be opened without a custom domain being set up first.
config.d1_databases = [{ binding: "DB", database_name: databaseName, database_id: databaseId }];
config.workers_dev = true;

// And his own domain on top of it, when there is one.
//
// The workers.dev address deliberately stays switched on beside it. It is the
// address in every link shared so far and the one the admin panel is bookmarked
// at, and turning it off to celebrate a new domain would break all of them on
// the same afternoon. The custom domain is simply a second door.
const siteDomain = process.env.CF_SITE_DOMAIN?.trim() ?? "";
const routes = routesFor(siteDomain, process.env.CF_ZONE_NAME?.trim() ?? "");
if (routes.length) {
  config.routes = routes;
  console.log(`Binding it to ${routes.map(route => route.pattern).join(" and ")}.`);
}

// Wake the worker every quarter of an hour to read the Google sheet and
// document. This is what makes them the site's controls rather than a copy of
// it: a change typed on a phone reaches the pages without anybody pressing
// anything, or being awake.
config.triggers = { crons: ["*/15 * * * *"] };

await writeFile(built, `${JSON.stringify(config, null, 2)}\n`);

// A second, tiny config used only to run the migrations. Wrangler resolves
// migrations_dir against the file's own folder, and keeping this out of the
// repository root means the dev build never picks it up by accident.
const migrate = {
  name: config.name,
  compatibility_date: config.compatibility_date,
  d1_databases: [{ binding: "DB", database_name: databaseName, database_id: databaseId, migrations_dir: "drizzle" }],
};
await writeFile(resolve(root, ".deploy.wrangler.json"), `${JSON.stringify(migrate, null, 2)}\n`);

console.log(`Ready to deploy "${config.name}" against D1 database "${databaseName}".`);

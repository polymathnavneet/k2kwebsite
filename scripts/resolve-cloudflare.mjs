/**
 * Works out where to deploy, asking Cloudflare rather than trusting what was
 * typed into the repository secrets.
 *
 * Copying four long codes between two dashboards by hand goes wrong, and it
 * went wrong here: the account id arrived 90 characters long with dashes in it.
 * The API token is the only value that genuinely cannot be derived - it is the
 * credential - and everything else follows from it. So the token is asked which
 * account it belongs to, that account is asked which database it holds, and the
 * mistyped secrets are simply not consulted unless they happen to be right.
 *
 * Resolved values are handed to the later steps through GITHUB_ENV.
 */
const API = "https://api.cloudflare.com/client/v4";
const token = process.env.CLOUDFLARE_API_TOKEN?.trim() ?? "";
const askedAccount = process.env.CLOUDFLARE_ACCOUNT_ID?.trim() ?? "";
const askedName = process.env.CLOUDFLARE_D1_DATABASE_NAME?.trim() ?? "";
const askedId = process.env.CLOUDFLARE_D1_DATABASE_ID?.trim() ?? "";
const workerName = process.env.CLOUDFLARE_WORKER_NAME?.trim() || "a-long-walk-navneet";

const HEX32 = /^[0-9a-f]{32}$/i;
const UUID = /^[0-9a-f-]{36}$/i;

async function call(path, init = {}) {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const body = await response.json().catch(() => ({}));
  return { ok: response.ok && body.success !== false, status: response.status, body };
}

function stop(...lines) {
  console.log(`\n${lines.join("\n")}`);
  process.exit(1);
}

if (!token) stop("CLOUDFLARE_API_TOKEN is not set. That is the one value that cannot be worked out.");

if (!(await call("/user/tokens/verify")).ok) {
  stop(
    "Cloudflare did not accept CLOUDFLARE_API_TOKEN.",
    "  Make a new one at dash.cloudflare.com/profile/api-tokens with the",
    '  "Edit Cloudflare Workers" template, and add an Account - D1 - Edit row.',
  );
}
console.log("The API token is valid.");

// --- which account ---------------------------------------------------------
const accounts = await call("/accounts");
const reachable = accounts.ok ? (accounts.body.result ?? []) : [];
let accountId = "";

if (HEX32.test(askedAccount) && (!reachable.length || reachable.some(a => a.id === askedAccount))) {
  accountId = askedAccount;
} else if (reachable.length === 1) {
  accountId = reachable[0].id;
  console.log(`Using the only account this token reaches: ${reachable[0].name} (${accountId})`);
  console.log("The CLOUDFLARE_ACCOUNT_ID secret does not match it and is being ignored.");
} else if (reachable.length > 1) {
  stop(
    "This token reaches more than one account and CLOUDFLARE_ACCOUNT_ID does not match any of them:",
    ...reachable.map(a => `  ${a.name} - ${a.id}`),
    "  Set CLOUDFLARE_ACCOUNT_ID to the one holding your database.",
  );
} else {
  stop(
    "CLOUDFLARE_ACCOUNT_ID does not look like an account id, and this token cannot list accounts to find the right one.",
    `  It should be 32 letters and numbers with no dashes; yours is ${askedAccount.length} characters.`,
    "  Find it at dash.cloudflare.com under Workers & Pages, in the right-hand column.",
  );
}

// --- which database --------------------------------------------------------
const databases = await call(`/accounts/${accountId}/d1/database`);
if (!databases.ok) {
  stop(
    "The account is reachable but its databases could not be listed.",
    "  The token is probably missing the Account - D1 - Edit permission.",
    `  Cloudflare said: ${JSON.stringify(databases.body.errors ?? databases.status)}`,
  );
}

const list = databases.body.result ?? [];
if (list.length) console.log(`Databases on this account: ${list.map(db => db.name).join(", ")}`);

let database = list.find(db => UUID.test(askedId) && db.uuid === askedId) ?? list.find(db => db.name === askedName);
if (!database && list.length === 1) {
  database = list[0];
  console.log(`Using the only database on this account: ${database.name}`);
} else if (!database && list.length > 1) {
  stop(
    "Neither database secret matches anything on this account:",
    ...list.map(db => `  ${db.name} - ${db.uuid}`),
    "  Set CLOUDFLARE_D1_DATABASE_NAME to the one this site should use.",
  );
}

if (!database) {
  // Nothing to overwrite, and the site cannot run without one. Creating it is
  // only ever done from empty, so a database made by hand is never duplicated.
  const wanted = askedName && /^[a-z0-9][a-z0-9-]{1,60}$/i.test(askedName) ? askedName : "a-long-walk";
  console.log(`This account has no database yet. Creating "${wanted}".`);
  const created = await call(`/accounts/${accountId}/d1/database`, { method: "POST", body: JSON.stringify({ name: wanted }) });
  if (!created.ok) stop("Could not create a database.", `  Cloudflare said: ${JSON.stringify(created.body.errors ?? created.status)}`);
  database = created.body.result;
  console.log(`Created "${database.name}".`);
}

// --- the public address ----------------------------------------------------
// A worker with no registered subdomain has nowhere to be served from, and the
// deploy fails late with an unhelpful message. Settle it before building.
let subdomain = "";
const existing = await call(`/accounts/${accountId}/workers/subdomain`);
if (existing.ok && existing.body.result?.subdomain) {
  subdomain = existing.body.result.subdomain;
} else {
  for (const candidate of ["navneet", "navneet-walk", "a-long-walk", `walk-${accountId.slice(0, 6)}`]) {
    const claimed = await call(`/accounts/${accountId}/workers/subdomain`, { method: "PUT", body: JSON.stringify({ subdomain: candidate }) });
    if (claimed.ok) { subdomain = claimed.body.result?.subdomain ?? candidate; console.log(`Registered the workers.dev name "${subdomain}".`); break; }
  }
  if (!subdomain) stop("This account has no workers.dev name and none of the candidates were free.", "  Pick one at dash.cloudflare.com under Workers & Pages - Subdomain.");
}

const siteUrl = `https://${workerName}.${subdomain}.workers.dev`;
console.log(`\nDeploying "${workerName}" against "${database.name}".`);
console.log(`The site will be at: ${siteUrl}`);

const { appendFileSync } = await import("node:fs");
appendFileSync(process.env.GITHUB_ENV, [
  `CF_ACCOUNT_ID=${accountId}`,
  `CF_D1_NAME=${database.name}`,
  `CF_D1_ID=${database.uuid}`,
  `CF_WORKER_NAME=${workerName}`,
  `CF_SITE_URL=${siteUrl}`,
  "",
].join("\n"));

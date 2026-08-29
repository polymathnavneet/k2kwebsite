/**
 * Works out which Cloudflare secret is wrong, and says what to put there.
 *
 * Wrangler answers a bad account id with "No route for that URI", which names
 * nothing and reads like an outage. Asking Cloudflare directly - is the token
 * good, which accounts does it reach, which databases are on them - turns that
 * into an instruction. Ids are printed on purpose: an account or database id is
 * not a credential (the API token is), and printing them is the only way for the
 * log to be useful to somebody who cannot read a stack trace.
 */
const API = "https://api.cloudflare.com/client/v4";
const token = process.env.CLOUDFLARE_API_TOKEN?.trim() ?? "";
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim() ?? "";
const wantName = process.env.CLOUDFLARE_D1_DATABASE_NAME?.trim() ?? "";
const wantId = process.env.CLOUDFLARE_D1_DATABASE_ID?.trim() ?? "";

const problems = [];
const say = (...lines) => problems.push(...lines);

async function call(path) {
  const response = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  const body = await response.json().catch(() => ({}));
  return { ok: response.ok && body.success !== false, status: response.status, body };
}

// Shape first. A value of the wrong length is the commonest mistake by far, and
// saying so costs nothing even when the network is unreachable.
const HEX32 = /^[0-9a-f]{32}$/i;
if (!HEX32.test(accountId)) {
  say(
    `CLOUDFLARE_ACCOUNT_ID does not look like an account id.`,
    `  It should be 32 letters and numbers with no dashes. Yours is ${accountId.length} characters` +
      `${accountId.includes("-") ? " and contains dashes, which suggests a database id was pasted instead" : ""}.`,
    `  Find it at dash.cloudflare.com - open Workers & Pages, and the Account ID is in the right-hand column.`,
  );
}

const verified = await call("/user/tokens/verify");
if (!verified.ok) {
  say(
    "",
    "CLOUDFLARE_API_TOKEN was not accepted by Cloudflare.",
    "  Make a new one at dash.cloudflare.com/profile/api-tokens using the",
    "  \"Edit Cloudflare Workers\" template, and add an Account - D1 - Edit row to it.",
  );
  console.log(problems.join("\n"));
  process.exit(1);
}
console.log("The API token is valid.");

const accounts = await call("/accounts");
if (accounts.ok && Array.isArray(accounts.body.result)) {
  console.log("Accounts this token can reach:");
  for (const account of accounts.body.result) console.log(`  ${account.name} - account id: ${account.id}`);
  if (!accounts.body.result.some(account => account.id === accountId)) {
    say(
      "",
      "CLOUDFLARE_ACCOUNT_ID does not match any account this token can reach.",
      accounts.body.result.length === 1
        ? `  Set CLOUDFLARE_ACCOUNT_ID to: ${accounts.body.result[0].id}`
        : "  Use the account id of whichever account above holds your database.",
    );
  }
} else {
  console.log("This token cannot list accounts, which is normal for a Workers-only token.");
}

if (problems.length) {
  console.log(problems.join("\n"));
  process.exit(1);
}

const databases = await call(`/accounts/${accountId}/d1/database`);
if (!databases.ok) {
  say(
    "",
    "The account is reachable but its databases could not be listed.",
    "  The token is probably missing the Account - D1 - Edit permission.",
    `  Cloudflare said: ${JSON.stringify(databases.body.errors ?? databases.status)}`,
  );
  console.log(problems.join("\n"));
  process.exit(1);
}

const list = databases.body.result ?? [];
console.log("Databases on this account:");
for (const db of list) console.log(`  ${db.name} - database id: ${db.uuid}`);

const byId = list.find(db => db.uuid === wantId);
const byName = list.find(db => db.name === wantName);
if (byId && byId.name === wantName) {
  console.log(`\nEverything matches. Deploying against "${wantName}".`);
  process.exit(0);
}

if (!list.length) say("", "This account has no D1 database yet. Create one, then copy its name and Database ID into the two secrets.");
else if (byName) say("", `The database "${byName.name}" exists but the id does not match it.`, `  Set CLOUDFLARE_D1_DATABASE_ID to: ${byName.uuid}`);
else if (byId) say("", `That id belongs to the database "${byId.name}".`, `  Set CLOUDFLARE_D1_DATABASE_NAME to: ${byId.name}`);
else say("", "Neither the name nor the id matches a database on this account.", "  Copy both from one of the databases listed above.");

console.log(problems.join("\n"));
process.exit(1);

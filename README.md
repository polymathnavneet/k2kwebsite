# A Long Walk

Navneet walking roughly 4,270 km from Kanyakumari to Kashmir, starting
**17 December 2026**. This repository is the website.

The route runs Kanyakumari → Madurai → Salem → Bengaluru → **Hyderabad → Nagpur**
→ Jabalpur → Rewa → Prayagraj → Varanasi → Lucknow → Delhi → Jammu → Srinagar.

---

## Three things worth knowing

### 1. Messages publish the moment they arrive

There is no holding queue and no "make public" step. Someone writes on one of the
`/ahead` pages and it is on `/messages` immediately. Only likely spam is held
back, and that still lands in the admin sheet where it can be released.

To reply: open `/admin`, type in the box under the message, press **Reply**. The
reply appears under it publicly.

### 2. The distance moves itself, and the dates follow

Open `/admin` → **Journey** → **Sync GPS & add distance**. Each fix is measured
against the last one and the gap is added to the distance walked, so the total
climbs on its own and every arrival date recalculates from it.

Two guards keep it honest, and the panel tells you which one it used:

- A move under **100 m** is ignored, so a phone drifting on a table overnight
  does not invent kilometres.
- A jump over **150 km** is ignored, so a bus or a bad fix moves the map pin
  without counting as walking.

Dates come from the planned pace until the walk goes Live, and from the pace
actually being walked after that. Walking faster pulls every date earlier;
resting pushes them back. Nothing is typed in by hand.

### 3. Claude and ChatGPT can both edit the content

Everything public is mirrored to plain JSON in [`data/`](data/), and can be
pulled back out of it:

| File | Holds |
| --- | --- |
| `data/route.json` | The route, the stops, the start date, the pace |
| `data/messages.json` | The public wall and the replies |
| `data/journey.json` | Where the walk has got to |
| `data/book.json` | The pre-registration count |

Anyone with repo access edits those files on GitHub. Then in `/admin` press
**Pull edits from GitHub** and it goes live. Anything changed in the admin panel
is written straight back, so the files always match the site.

**Contact details are never written to these files.** This repository is public.
Email addresses and phone numbers stay in the database and appear only in the
admin sheet, which exports them as CSV for a spreadsheet.

---

## Setup

Two environment variables in the hosting environment.

| Variable | What it does |
| --- | --- |
| `ADMIN_TOKEN` | The private passcode for `/admin`. Required. |
| `GITHUB_TOKEN` | Switches on the `data/` bridge. Optional. |

Without `GITHUB_TOKEN` the site works exactly as before — the mirror simply does
nothing and the **Pull edits from GitHub** button stays hidden.

To create it: **GitHub → Settings → Developer settings → Personal access tokens →
Fine-grained tokens**. Give it access to this repository only, with
**Contents: Read and write**, and nothing else. `GITHUB_REPO` and `GITHUB_BRANCH`
can override the defaults (`polymathnavneet/k2kwebsite` and `main`).

Commits made by the site carry `[skip ci]`, because the site reads its content
from the database rather than the build — rebuilding on every message would only
add delay.

## Offline

The walk goes through places with no signal, so `public/sw.js` caches every page
and the last thing each API returned. With no signal the site still opens and
still shows the wall, the route and the map. A message or a book pre-registration
written offline is saved on the phone and sent when the signal returns, and a red
bar says so rather than leaving it looking lost.

## API

| Endpoint | Auth | Does |
| --- | --- | --- |
| `GET/POST /api/messages` | POST admin actions only | The wall; posting publishes immediately |
| `GET/POST /api/route` | POST: admin | The route and its stops |
| `GET/POST /api/journey` | POST: admin | Status, distance, latest dispatch |
| `POST /api/gps` | admin | Sync a GPS fix and move the distance |
| `GET/POST /api/sync` | POST: admin | Pull `data/*.json` from GitHub |
| `GET/POST /api/book` | admin for the list | Pre-registrations; public sees a count |
| `GET/POST /api/reactions` | — | Cheer and follow counts |

## Checks

```
npm run lint
node --test tests/*.test.mjs
npm run build
```

`tests/walk-logic.test.mjs` guards the start date, the total distance, the
Hyderabad-before-Nagpur order, and that GPS drift and bus rides do not inflate
the distance while real walking does.
`tests/github-bridge.test.mjs` guards the `data/` bridge.

Two test failures and one lint error predate this work and are unrelated:
`renders development preview metadata`, `emits the catalog's animation and
scrolling utilities`, and a `set-state-in-effect` error in `components/games.tsx`.

---

# Notes from the starter template

A clean full-stack starter running on
[vinext](https://github.com/cloudflare/vinext), with optional Cloudflare D1 and
Drizzle support.

## Prerequisites

- Node.js `>=22.13.0`
- Linux with `flock`, `curl`, and GNU `timeout`

## Sites Lifecycle

The Sites lifecycle CLI runs the locked dependency install before returning this checkout. Edit the source under `app/`, then checkpoint when a coherent milestone is ready to inspect or share. The remote Sites builder runs `npm run build` against the pushed commit. Do not repeat install or build as a normal pre-checkpoint step.

This starter does not use `wrangler.jsonc`.

`install:ci` is intentionally a single, non-retrying `npm ci`. It refuses a concurrent install for the same project, consumes a matching image-seeded npm cache with `--prefer-offline` while retaining registry fallback for a missing cache object, otherwise downloads and verifies the complete vinext tarball recorded in `package-lock.json`, limits npm to one socket, and terminates a stalled install. `build` applies a short timeout. These helpers target Linux and use GNU `timeout`; they are not native macOS scripts.

Scripts that need writable project-scoped home, npm, XDG, and temporary paths use `scripts/sites-env.sh`. The `dev` and `start` scripts honor the caller's runtime environment and keep Wrangler logs inside the checkout. The generated `.sites-runtime/` directory is disposable and ignored by Git.

## Included Shape

- edit site code under `app/`
- `app/chatgpt-auth.ts` provides optional dispatch-owned ChatGPT sign-in helpers
- `.openai/hosting.json` declares optional Sites D1 and R2 bindings
- `vite.config.ts` simulates declared bindings for local development
- `db/index.ts` reads the D1 binding from the Cloudflare Worker environment
- `db/schema.ts` starts intentionally empty
- `examples/d1/` contains an optional D1 example surface
- `drizzle.config.ts` supports local migration generation when needed

## Workspace Auth Headers

OpenAI workspace sites can read the current user's email from
`oai-authenticated-user-email`.

SIWC-authenticated workspace sites may also receive
`oai-authenticated-user-full-name` when the user's SIWC profile has a non-empty
`name` claim. The full-name value is percent-encoded UTF-8 and is accompanied by
`oai-authenticated-user-full-name-encoding: percent-encoded-utf-8`.

Treat the full name as optional and fall back to email when it is absent:

```tsx
import { headers } from "next/headers";

export default async function Home() {
  const requestHeaders = await headers();
  const email = requestHeaders.get("oai-authenticated-user-email");
  const encodedFullName = requestHeaders.get("oai-authenticated-user-full-name");
  const fullName =
    encodedFullName &&
    requestHeaders.get("oai-authenticated-user-full-name-encoding") ===
      "percent-encoded-utf-8"
      ? decodeURIComponent(encodedFullName)
      : null;

  const displayName = fullName ?? email;
  // ...
}
```

## Optional Dispatch-Owned ChatGPT Sign-In

Import the ready-to-use helpers from `app/chatgpt-auth.ts` when the site needs
optional or required ChatGPT sign-in:

- Use `getChatGPTUser()` for optional signed-in UI.
- Use `requireChatGPTUser(returnTo)` for server-rendered pages that should send
  anonymous visitors through Sign in with ChatGPT.
- In a Server Component, start sign-in with
  `<a href={chatGPTSignInPath(returnTo)} target="_top">`. The auth helper
  module is server-only; do not import it into a Client Component.
- Do not use `fetch`, XHR, a client-side router, or a framework link that can
  prefetch the sign-in route. SIWC must start as a top-level navigation.
- Never request the AuthAPI authorization endpoint directly. The dispatch-owned
  `/signin-with-chatgpt` route must start the SIWC flow.
- Use `chatGPTSignOutPath(returnTo)` for browser sign-out links or actions.
- Pass a same-origin relative `returnTo` path for the destination after sign-in
  or sign-out. The helper validates and safely encodes it.
- Mark protected pages with `export const dynamic = "force-dynamic"` because
  they depend on per-request identity headers.

Dispatch owns `/signin-with-chatgpt`, `/signout-with-chatgpt`, `/callback`, the
OAuth cookies, and identity header injection. Do not implement app routes for
those reserved paths. Routes that do not import and call the helper remain
anonymous-compatible.

SIWC establishes identity only; it does not prove workspace membership. Use the
Sites hosting platform's access policy controls for workspace-wide restrictions,
or enforce explicit server-side membership or allowlist checks.

Use SIWC for account pages, user-specific dashboards, saved records, and write
actions tied to the current ChatGPT user. Leave public content anonymous.

## Diagnostic Commands

- `npm run install:ci`: perform the one bounded lockfile install
- `npm run dev`: start the Vite/Vinext development server
- `npm run build`: build the deployable Sites artifact
- `npm run start`: start the built Vinext application
- `npm test`: build and verify the rendered development-preview metadata
- `npm run db:generate`: generate Drizzle migrations after schema changes

Use build commands for targeted diagnosis after a remote failure, not as part of the normal checkpoint path.

The timeout defaults can be overridden for a controlled canary with `SITES_INSTALL_TIMEOUT`, `SITES_INSTALL_KILL_AFTER`, `SITES_BUILD_TIMEOUT`, and `SITES_BUILD_KILL_AFTER`. A timeout fails the command; the helpers never retry an unchanged install or build.

## Learn More

- [vinext Documentation](https://github.com/cloudflare/vinext)
- [Drizzle D1 Guide](https://orm.drizzle.team/docs/get-started/d1-new)

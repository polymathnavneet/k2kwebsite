# K2K · Navneet

Kanyakumari → Kashmir on foot.

## Project

Navneet is preparing to walk approximately 4,000 km from Kanyakumari to Kashmir, beginning 1 December 2026. The current planning window is 4–6 months.

The expedition combines endurance, travel, field writing, photography, video and conversations with people along the route.

## Site

- `index.html` — project home and mission
- `about.html` — Navneet and the story behind K2K
- `route.html` — dated working route and checkpoint calendar
- `expedition.html` — practical expedition plan
- `tracker.html` — public live GPS map
- `tracker-admin.html` — private phone GPS broadcaster
- `journal.html` — journey notes
- `press.html` — media facts and enquiry form
- `join.html` — public messages, dreams and recommendations
- `sponsorship.html` — partnership proposal and enquiry form

## Live GPS architecture

The tracker uses Netlify Functions + Netlify Blobs.

1. Navneet opens `/tracker-admin.html` on the phone.
2. The phone requests browser GPS permission.
3. The page sends the latest coordinates every 30 seconds to `/api/location`.
4. The Netlify Function checks the private `K2K_TRACKER_TOKEN` environment variable.
5. The latest point is stored in the `k2k-tracker` Netlify Blobs store.
6. The public `/tracker.html` page reads `/api/location` every 15 seconds.
7. Before the first live update, the API returns Lucknow as the preparation marker.

### One-time Netlify setup

In Netlify, open **Project configuration → Environment variables** and add:

- Key: `K2K_TRACKER_TOKEN`
- Value: a long private token you choose
- Scope: Functions/runtime

Then redeploy the site.

Do **not** put the token in GitHub.

On the phone, open `/tracker-admin.html`, paste the token once, save it, and press **Start live GPS**.

## Journey control room

The homepage is a dynamic preparation/live expedition dashboard. It reads public state from `/api/journey` and falls back to `journey-data.js` when the backend is unavailable.

- Open `/journey-admin.html` privately on the phone to publish status, distance, steps, field conditions, the next stop, latest dispatch and partner of the day.
- The publisher uses the existing `K2K_TRACKER_TOKEN`; the token is stored only in that browser's local storage and sent as a request header.
- Public data is stored in the `k2k-journey` Netlify Blobs store.
- The control room refreshes automatically every 60 seconds.
- `/community.html` collects route recommendations, documentary leads, questions and offers of practical help through a moderated Netlify form.

## Forms

Sponsorship, media and Join K2K submissions use Netlify Forms. Submissions appear in the site's Netlify Forms area after form detection is enabled and a deploy containing the forms has completed.

## Route dates

The dates shown on the website are planning estimates. The working assumption is roughly 28 km per walking day. Weather, rest, road safety, accommodation and route changes can move the dates.

## Design direction

The site uses a flat, editorial expedition style: strong typography, rules, maps, dates, route checkpoints, live tracking, community participation, media information and partnership storytelling. The information architecture takes inspiration from modern expedition campaign sites while using original K2K content and structure.

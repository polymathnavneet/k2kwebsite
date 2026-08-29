# The editable content of A Long Walk

These four files are the site's content in plain JSON. Edit them here — by hand,
or with any assistant that has access to this repository — then open `/admin` on
the site and press **Pull edits from GitHub** to make the change live.

Anything changed in the admin panel is written straight back into these files, so
they always reflect what the site is currently showing.

| File | Holds | Editing it does |
| --- | --- | --- |
| `route.json` | Stops, start date, planned pace | Replans the route and every arrival date |
| `messages.json` | The public wall and the replies | Updates a reply, or hides a message |
| `journey.json` | Where the walk has got to | Moves the map pin and the distance |
| `book.json` | Pre-registration count | Nothing — it is written by the site |

## Rules that will save you a confusing afternoon

**Never put an email address or a phone number in these files.** This repository
is public. Contact details stay in the database and appear only in the admin
sheet.

**Arrival dates are not stored anywhere.** They are calculated from `km`,
`startDate`, `paceKmPerDay` and the distance actually walked. There is no date
field to edit, and adding one does nothing.

**In `route.json`, `km` is what orders the route.** It is the distance from
Kanyakumari, and it must increase down the list. Reordering the array without
changing `km` will be rejected.

**In `messages.json`, messages are matched by `id`.** Only `reply` and `status`
are read back. Adding an entry by hand does not create a message on the site —
that keeps an edit from being able to invent a person who never wrote in.
Valid `status` values are `public`, `held` and `hidden`.

**A pull rewrites these files afterwards.** Comments or extra fields you add will
not survive. Put explanations in this README instead.

## If your edit does not appear

Check that `GITHUB_TOKEN` is set in the hosting environment. Without it the
bridge is switched off and the **Pull edits from GitHub** button is hidden.

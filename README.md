# Kerala Trip HQ

Static trip planner for 22–29 Dec 2026, hosted on GitHub Pages. No server, no accounts, nothing to install.

* Open the page, tap **I'm Sahith / Manoj / Bhargava / Darshan**, and start planning: explore places, vote, comment,
  suggest changes, log expenses (also on behalf of someone else).
* Your inputs are saved in your browser straight away. **Crew → Send my updates** files them as a GitHub issue; a
  workflow (`.github/workflows/site.yml`) merges them into `public/data/state.json` and redeploys, so everyone sees
  each other's inputs about a minute later.
* Claude Code reads `public/data/state.json` (people → posts, votes, comments, expenses), improves the plan, and
  writes the result back to the same file (`itinerary`, `meta`, `reviews`, `decisions`, `bookings`).
* Same pattern as `fundamentals-tracker` and `jobintel`: static site, Actions deploy, data in the repo.

## One-time setup
Settings → Pages → Source: **GitHub Actions**. Then every push to `main` deploys. Site: https://bhargavaramkv.github.io/kerala-trip-hq/

## Notes
* Identity is "pick your name". It is not verified, which is fine for four friends; the issue author is logged in `inputLog`.
* Sending updates needs a free GitHub account (signed in once). Reading the site needs nothing.
* `scripts/merge-inputs.mjs` validates and size-limits every update before merging; `node scripts/test-merge.mjs` tests it.

## Itinerary workflow (versions are only stored when the owner says so)
* **Nothing stable yet:** the itinerary is `v1`, status `draft`. Changes overwrite `v1` in place (`node scripts/itinerary.mjs draft <days.json> "what changed"`). When the owner says it is stable: `node scripts/itinerary.mjs approve`.
* **Once a version is stable** (`status: approved`, named in `meta.state.stable`): changes go to one working draft, `itinerary/draft`, which overwrites itself on each change and shows on the site as "Working draft". When the owner says it is good: `node scripts/itinerary.mjs promote` (it becomes the next `vN`, stable). To drop it: `node scripts/itinerary.mjs discard`.
* Never save drafts as numbered versions. Check state with `node scripts/itinerary.mjs status`; `node scripts/test-itinerary.mjs` tests this.

## Maps
* Maps use Leaflet with Esri topographic and satellite tiles (no key needed; attribution shown on the map).
* `public/data/routes.json` holds the real road line for each day, built once from the OpenStreetMap road network through the public OSRM router. Rebuild it if the route changes. If Leaflet or the file cannot load, the app falls back to the simple drawn map.

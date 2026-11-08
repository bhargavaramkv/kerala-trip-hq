# Kerala Trip HQ

Static trip planner for 22–26 Dec 2026, hosted on GitHub Pages. No server, no accounts, nothing to install.

* Open the page, tap **I'm Sahith / Manoj / Bhargava**, and start planning: explore places, vote, comment,
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
* Identity is "pick your name". It is not verified, which is fine for three friends; the issue author is logged in `inputLog`.
* Sending updates needs a free GitHub account (signed in once). Reading the site needs nothing.
* `scripts/merge-inputs.mjs` validates and size-limits every update before merging; `node scripts/test-merge.mjs` tests it.

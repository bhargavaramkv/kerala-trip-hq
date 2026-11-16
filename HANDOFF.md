# Handoff for the next Claude session

Read this first, then README.md and PLANNER.md.

## Where things stand (16 Nov 2026)
- Site: https://bhargavaramkv.github.io/kerala-trip-hq/ (GitHub Pages, deployed by `.github/workflows/site.yml` on every push to `main`). Push straight to `main`, no PRs, run the checks first: `node scripts/test-merge.mjs && node scripts/test-itinerary.mjs && node --check public/shim.js`. No model names in commit messages.
- Owner (Bhargava) gives full authority; ask only when a decision needs facts only he has. Keep final messages short.
- Crew: Bhargava, Sahith, Manoj, Darshan (tickets spell them Bhargav, Dharshan). Trip 22–29 Dec 2026, self-drive car, home 07:50 Wed 30 Dec.
- Itinerary: `v1` is the stable version. A **working draft** (`itinerary.draft`) holds: real road distances, day 8 following the real return tickets, and the "must-visits first" rework (Top Station, Varkala three nights, Kovalam as a sunset visit). It becomes `v2` only when the owner says "store it" (`node scripts/itinerary.mjs promote`).
- Budget counts known costs only (no estimates): trains ₹2,170 + ₹3,110 (paid by Sahith), car about ₹11,000, petrol about ₹7,000.
- Wallet → Tickets: return trains 12625 (Ernakulam Town 16:10 → Palakkad 19:12, all confirmed) and 16528 (Palakkad 22:00 → Yesvantpur 07:50, Bhargav RAC 1, Manoj RAC 2). Outbound 12684 PNR and berths still missing.
- Each stay booking has a shortlist (`options`) of well-rated, good-value places.
- Maps: Leaflet + Esri tiles; road lines in `public/data/routes.json` from the public OSRM router.

## Open items
- Bhargava's two suggestions (stays shortlist, must-visits) were acted on from a screenshot but are still unsent from his phone; once sent and merged, reply to them per PLANNER.md.
- A scheduled "process crew input" task was refused by the permission check; the owner must allow `mcp__claude-code-remote__create_trigger` first.
- Ask the owner whether to mask PNRs/booking IDs on the public site.

# Trip planner: how to process crew input

Run this whenever new crew input may have arrived (a scheduled task does it every few hours).

1. `git pull origin main`, then read `public/data/state.json`.
2. New input = anything in `people.<id>.posts` (comments and suggestions), `votes` or `polls` with `at` later than `meta.planner.lastSeen` (0 if missing). Ignore `people.ai` (that is the planner itself). If there is nothing new, stop: no commit.
3. For every new comment or suggestion, reply as the planner by adding a post to `people.ai.posts`:
   `{ "id": "ai-<short unique>", "at": <now ms>, "kind": "comment", "target": <same target as theirs>, "parent": <their post id; for a suggestion use its id and target its id>, "body": "<reply>" }`
   Create `people.ai` if missing: `{ "nick": "Trip planner", "joinedAt": 0, "posts": [], "expenses": [], "votes": {}, "reacts": {}, "polls": {}, "updatedAt": <now> }`.
   Keep replies short and specific: answer the question, say what changes and what it costs in time or money, or why not.
4. If the input asks for a plan change and it is sound, apply it to the **working draft** only: export the current days (`itinerary.draft` if present, else the stable version), edit them, keep every drive leg timed (`drive`, `km`, `mins`) and the clock consistent, then `node scripts/itinerary.mjs draft <days.json> "<what changed and why>"`. Never create or approve a version: only the owner says "store it". Say in the reply that it is in the draft.
5. Do not change bookings, tickets or the budget from crew input; ask the owner in the reply instead.
6. Set `meta.planner = { "lastSeen": <max at processed>, "at": <now> }` and `updated` to now.
7. Run `node scripts/test-merge.mjs && node scripts/test-itinerary.mjs && node --check public/shim.js`, then commit ("Planner: reply to crew input") and push to `main`. No pull requests, and no model names in commit messages.

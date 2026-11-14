// Itinerary workflow: one stable version at a time, plus at most one working draft.
//   status                     show the stable version and whether a draft exists
//   draft <days.json> "why"    write the plan to the working draft (overwrites it) and show it on the site
//   promote                    store the working draft as the next stable version
//   discard                    drop the working draft and show the stable version again
// Versions are only created by "promote", when the owner says the draft is good.
import fs from "node:fs";
import { fileURLToPath } from "node:url";

export const DRAFT = "draft";
const isVersion = (k, v) => k !== DRAFT && v && Array.isArray(v.days);
const versionIds = st => Object.entries(st.itinerary || {}).filter(([k, v]) => isVersion(k, v)).map(([k]) => k);
const maxN = st => Math.max(0, ...versionIds(st).map(k => st.itinerary[k].n || 0));
export const stableId = st => (st.meta && st.meta.state && st.meta.state.stable) || (versionIds(st).sort((a, b) => st.itinerary[b].n - st.itinerary[a].n)[0]) || null;

export function setDraft(st, days, why, now = Date.now()) {
  if (!Array.isArray(days) || !days.length) throw new Error("days must be a non-empty array");
  const base = stableId(st);
  st.itinerary = st.itinerary || {};
  st.itinerary[DRAFT] = { at: now, by: "ai", why: String(why || "Working draft"), status: "draft", plan: "A", days, adjust: {}, adjustNotes: [], basedOn: base };
  st.meta = st.meta || {}; st.meta.state = Object.assign({}, st.meta.state, { current: DRAFT, stable: base, at: now });
  st.updated = now; return st;
}
export function promote(st, now = Date.now()) {
  const d = st.itinerary && st.itinerary[DRAFT];
  if (!d) throw new Error("There is no working draft to store");
  const n = maxN(st) + 1, id = "v" + n;
  st.itinerary[id] = Object.assign({}, d, { n, at: now, status: "approved", approvedBy: "owner", approvedAt: now });
  delete st.itinerary[DRAFT];
  st.meta.state = Object.assign({}, st.meta.state, { current: id, stable: id, at: now });
  st.updated = now; return id;
}
export function discard(st, now = Date.now()) {
  if (st.itinerary) delete st.itinerary[DRAFT];
  const base = stableId(st);
  st.meta.state = Object.assign({}, st.meta.state, { current: base, stable: base, at: now });
  st.updated = now; return base;
}
export function status(st) {
  const sid = stableId(st), d = st.itinerary && st.itinerary[DRAFT];
  return { stable: sid, current: st.meta && st.meta.state && st.meta.state.current, draft: d ? { basedOn: d.basedOn, why: d.why } : null };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const file = process.env.STATE_FILE || "public/data/state.json";
  const st = JSON.parse(fs.readFileSync(file, "utf8")); const [cmd, a, b] = process.argv.slice(2);
  let out;
  if (cmd === "draft") out = (setDraft(st, JSON.parse(fs.readFileSync(a, "utf8")), b), status(st));
  else if (cmd === "promote") out = { stored: promote(st) };
  else if (cmd === "discard") out = { showing: discard(st) };
  else if (cmd === "status") { console.log(JSON.stringify(status(st), null, 1)); process.exit(0); }
  else { console.error("usage: itinerary.mjs status | draft <days.json> \"why\" | promote | discard"); process.exit(2); }
  fs.writeFileSync(file, JSON.stringify(st, null, 1) + "\n"); console.log(JSON.stringify(out));
}

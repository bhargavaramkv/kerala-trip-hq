// Merges one "Crew update" GitHub issue into public/data/state.json.
// Usage in CI: reads the issue from $GITHUB_EVENT_PATH. For tests: node scripts/merge-inputs.mjs <event.json> <state.json>
import { readFileSync, writeFileSync } from "node:fs";

const eventPath = process.argv[2] || process.env.GITHUB_EVENT_PATH;
const statePath = process.argv[3] || "public/data/state.json";
const clip = (s, n) => String(s ?? "").slice(0, n);
const num = (x, lo, hi) => { const v = Number(x); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : 0; };
const obj = x => (x && typeof x === "object" && !Array.isArray(x) ? x : {});
const arr = (x, n) => (Array.isArray(x) ? x.slice(0, n) : []);
const ID = /^[a-z0-9][a-z0-9-]{0,29}$/;
const CATS = ["destination", "activity", "food", "stay", "transport", "budget", "other"];
const BCATS = ["transport", "stays", "food", "activities", "misc"];

export function sanitizeDoc(d, name) {
  d = obj(d);
  const posts = arr(d.posts, 300).map(p => obj(p)).filter(p => ["suggestion", "comment"].includes(p.kind) && p.id).map(p => p.kind === "comment"
    ? { id: clip(p.id, 40), at: num(p.at, 0, 4e12), kind: "comment", target: clip(p.target, 80), parent: p.parent ? clip(p.parent, 40) : null, body: clip(p.body, 1200) }
    : { id: clip(p.id, 40), at: num(p.at, 0, 4e12), kind: "suggestion", cat: CATS.includes(p.cat) ? p.cat : "other", title: clip(p.title, 120), body: clip(p.body, 1500), cost: num(p.cost, 0, 1e8), target: p.target ? clip(p.target, 80) : null });
  const expenses = arr(d.expenses, 300).map(e => obj(e)).filter(e => e.id && num(e.amount, 0, 1e8) > 0).map(e => ({ id: clip(e.id, 40), amount: num(e.amount, 0, 1e8), cat: BCATS.includes(e.cat) ? e.cat : "misc", note: clip(e.note, 80), paidBy: clip(e.paidBy, 60), at: num(e.at, 0, 4e12) }));
  const votes = {}; Object.entries(obj(d.votes)).slice(0, 600).forEach(([k, v]) => { v = obj(v); if (v.v === 1 || v.v === -1) votes[clip(k, 80)] = { v: v.v, at: num(v.at, 0, 4e12) }; });
  const reacts = {}; Object.entries(obj(d.reacts)).slice(0, 600).forEach(([k, v]) => { v = obj(v); if (["🔥", "😍", "🤔", "💸"].includes(v.e)) reacts[clip(k, 80)] = { e: v.e, at: num(v.at, 0, 4e12) }; });
  const polls = {}; Object.entries(obj(d.polls)).slice(0, 20).forEach(([k, v]) => { v = obj(v); if (v.o) polls[clip(k, 40)] = { o: clip(v.o, 20), at: num(v.at, 0, 4e12) }; });
  return { nick: clip(d.nick || name, 30), joinedAt: num(d.joinedAt, 0, 4e12), posts, expenses, votes, reacts, polls, updatedAt: Date.now() };
}

export function parseIssue(issue) {
  if (!issue || !/^Crew update:/i.test(issue.title || "")) return null;
  const m = String(issue.body || "").match(/```(?:json)?\s*([\s\S]*?)```/) ; if (!m) return null;
  let p; try { p = JSON.parse(m[1]); } catch { return null; }
  if (!p || p.v !== 1 || !ID.test(String(p.who || ""))) return null;
  return { id: p.who, name: clip(p.name, 30), doc: sanitizeDoc(p.doc, p.name) };
}

export function merge(state, issue) {
  const r = parseIssue(issue); if (!r) return { state, merged: false };
  state.people = obj(state.people);
  const prev = state.people[r.id];
  if (prev && prev.updatedAt && r.doc.posts.length + r.doc.expenses.length + Object.keys(r.doc.votes).length < 1 && (prev.posts || []).length) return { state, merged: false, reason: "empty update would erase existing inputs" };
  state.people[r.id] = r.doc; state.updated = Date.now();
  state.inputLog = arr([{ at: Date.now(), who: r.id, issue: issue.number, by: issue.user && issue.user.login }].concat(arr(state.inputLog, 99)), 100);
  return { state, merged: true, id: r.id };
}

if (process.argv[1] && process.argv[1].endsWith("merge-inputs.mjs")) {
  const ev = JSON.parse(readFileSync(eventPath, "utf8")); const issue = ev.issue || ev;
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  const out = merge(state, issue);
  if (out.merged) { writeFileSync(statePath, JSON.stringify(out.state, null, 1)); console.log("merged update from", out.id); } else console.log("no merge", out.reason || "(not a crew update)");
  const token = process.env.GITHUB_TOKEN, repo = process.env.GITHUB_REPOSITORY;
  if (token && repo && issue.number && /^Crew update:/i.test(issue.title || "")) {
    const h = { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "content-type": "application/json" };
    const base = `https://api.github.com/repos/${repo}/issues/${issue.number}`;
    await fetch(base + "/comments", { method: "POST", headers: h, body: JSON.stringify({ body: out.merged ? "Merged into the crew data. It will appear on the site in a minute." : "Could not read this update" + (out.reason ? ": " + out.reason : ". Use the Send button in the app.") }) });
    await fetch(base, { method: "PATCH", headers: h, body: JSON.stringify({ state: "closed", state_reason: out.merged ? "completed" : "not_planned" }) });
  }
}

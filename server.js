"use strict";
/* Kerala Trip HQ server: one shared invite link, Google sign-in (or name-only), SQLite storage, live updates.
   No npm dependencies. Needs Node 22.13+ (built-in node:sqlite). */
const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");

const PORT = +process.env.PORT || 3000;
const DATA_DIR = path.resolve(process.env.DATA_DIR || "./data");
const BASE_URL = (process.env.BASE_URL || "").replace(/\/+$/, "");
const GOOGLE_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const OWNER_EMAIL = (process.env.OWNER_EMAIL || "").trim().toLowerCase();

const AI_KEY = process.env.ANTHROPIC_API_KEY || "";
const AI_MODEL = process.env.AI_MODEL || "claude-sonnet-5-5";
const SESSION_DAYS = 365;
const COLLECTIONS = ["people", "roster", "reviews", "decisions", "itinerary", "bookings", "meta"];

fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(path.join(DATA_DIR, "trip.db"));
db.exec(`
PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS docs(col TEXT, id TEXT, data TEXT NOT NULL, updated INTEGER, PRIMARY KEY(col,id));
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, name TEXT, picture TEXT, verified INTEGER DEFAULT 0, provider TEXT, created INTEGER);
CREATE TABLE IF NOT EXISTS members(user_id TEXT PRIMARY KEY, role TEXT DEFAULT 'member', status TEXT DEFAULT 'active', joined INTEGER);
CREATE TABLE IF NOT EXISTS sessions(sid TEXT PRIMARY KEY, user_id TEXT, expires INTEGER);
CREATE TABLE IF NOT EXISTS settings(k TEXT PRIMARY KEY, v TEXT);
`);
const q = {
  getSetting: db.prepare("SELECT v FROM settings WHERE k=?"),
  setSetting: db.prepare("INSERT INTO settings(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v"),
  listDocs: db.prepare("SELECT id,data FROM docs WHERE col=?"),
  putDoc: db.prepare("INSERT INTO docs(col,id,data,updated) VALUES(?,?,?,?) ON CONFLICT(col,id) DO UPDATE SET data=excluded.data, updated=excluded.updated"),
  delDoc: db.prepare("DELETE FROM docs WHERE col=? AND id=?"),
  getDoc: db.prepare("SELECT data FROM docs WHERE col=? AND id=?"),
  getUser: db.prepare("SELECT * FROM users WHERE id=?"),
  putUser: db.prepare("INSERT INTO users(id,name,picture,verified,provider,created) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, picture=excluded.picture, verified=MAX(users.verified,excluded.verified)"),
  getMember: db.prepare("SELECT * FROM members WHERE user_id=?"),
  putMember: db.prepare("INSERT INTO members(user_id,role,status,joined) VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET role=excluded.role, status=excluded.status"),
  setStatus: db.prepare("UPDATE members SET status=? WHERE user_id=?"),
  putSession: db.prepare("INSERT INTO sessions(sid,user_id,expires) VALUES(?,?,?)"),
  getSession: db.prepare("SELECT * FROM sessions WHERE sid=? AND expires>?"),
  delSession: db.prepare("DELETE FROM sessions WHERE sid=?"),
  delUserSessions: db.prepare("DELETE FROM sessions WHERE user_id=?"),
  allMembers: db.prepare("SELECT u.id,u.name,u.picture,u.verified,m.role,m.status FROM members m JOIN users u ON u.id=m.user_id"),
  hasOwner: db.prepare("SELECT 1 FROM members WHERE role='owner' AND status='active' LIMIT 1")
};
const rand = (n = 24) => crypto.randomBytes(n).toString("base64url");
function setting(k, make) { const r = q.getSetting.get(k); if (r) return r.v; const v = make(); q.setSetting.run(k, v); return v; }
const SECRET = process.env.SESSION_SECRET || setting("secret", () => rand(32));
const ADMIN_KEY = process.env.ADMIN_KEY || setting("admin_key", () => rand(18));
const anonEnv = String(process.env.ALLOW_ANON || "").toLowerCase();
const ALLOW_ANON = anonEnv ? ["1", "true", "yes"].includes(anonEnv) : !(GOOGLE_ID && GOOGLE_SECRET); /* zero-config: name-only joining unless Google is set up */
const sign = v => crypto.createHmac("sha256", SECRET).update(v).digest("base64url");
const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const inviteToken = () => setting("invite", () => rand(18));

/* ---- seed the starting booking tracker once ---- */
if (!q.getSetting.get("seeded")) {
  const dir = path.join(__dirname, "seed", "bookings");
  if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir)) if (f.endsWith(".json")) {
    try { const d = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); delete d._id; delete d.version; q.putDoc.run("bookings", f.slice(0, -5), JSON.stringify(d), Date.now()); } catch (e) { console.error("seed", f, e.message); }
  }
  q.setSetting.run("seeded", "1");
}

/* ---- http helpers ---- */
const isHttps = BASE_URL.startsWith("https://");
function cookies(req) { const o = {}; String(req.headers.cookie || "").split(/;\s*/).forEach(p => { const i = p.indexOf("="); if (i > 0) o[p.slice(0, i)] = decodeURIComponent(p.slice(i + 1)); }); return o; }
function cookie(name, val, maxAge) { return `${name}=${encodeURIComponent(val)}; Path=/; HttpOnly; SameSite=Lax;${isHttps ? " Secure;" : ""} Max-Age=${maxAge}`; }
function send(res, code, body, headers) { const isObj = typeof body === "object" && !Buffer.isBuffer(body); res.writeHead(code, Object.assign({ "Content-Type": isObj ? "application/json" : "text/html; charset=utf-8", "Cache-Control": "no-store" }, headers || {})); res.end(isObj ? JSON.stringify(body) : body); }
const redirect = (res, to, headers) => { res.writeHead(302, Object.assign({ Location: to, "Cache-Control": "no-store" }, headers || {})); res.end(); };
function readBody(req, max = 600000) { return new Promise((ok, no) => { let n = 0; const c = []; req.on("data", b => { n += b.length; if (n > max) { no(Object.assign(new Error("too large"), { status: 413 })); req.destroy(); } else c.push(b); }); req.on("end", () => ok(Buffer.concat(c).toString("utf8"))); req.on("error", no); }); }
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const origin = req => BASE_URL || `${req.headers["x-forwarded-proto"] || "http"}://${req.headers.host}`;

/* ---- auth ---- */
function sessionUser(req) {
  const sid = cookies(req).sid; if (!sid) return null;
  const [id, sig] = sid.split("."); if (!id || !sig || !safeEq(sig, sign(id))) return null;
  const s = q.getSession.get(id, Date.now()); if (!s) return null;
  const u = q.getUser.get(s.user_id), m = q.getMember.get(s.user_id); if (!u || !m) return null;
  return { id: u.id, name: u.name, picture: u.picture, verified: !!u.verified, role: m.role, status: m.status, isOwner: m.role === "owner" };
}
function startSession(res, userId, extra) {
  const id = rand(24); q.putSession.run(id, userId, Date.now() + SESSION_DAYS * 864e5);
  return [cookie("sid", id + "." + sign(id), SESSION_DAYS * 86400)].concat(extra || []);
}
function joinCrew(user, role) {
  q.putUser.run(user.id, user.name, user.picture || "", user.verified ? 1 : 0, user.provider, Date.now());
  const m = q.getMember.get(user.id);
  if (m && m.status === "removed") return false;
  q.putMember.run(user.id, m && m.role === "owner" ? "owner" : role, "active", m ? m.joined : Date.now());
  if (!q.getDoc.get("roster", user.id) || role === "owner") q.putDoc.run("roster", user.id, JSON.stringify({ role: m && m.role === "owner" ? "owner" : role, status: "active", at: Date.now() }), Date.now());
  if (!q.getDoc.get("people", user.id)) {
    const nick = String(user.name || "Traveller").trim().split(/\s+/)[0].slice(0, 30) || "Traveller";
    q.putDoc.run("people", user.id, JSON.stringify({ nick, joinedAt: Date.now(), posts: [], expenses: [], votes: {}, reacts: {}, polls: {}, updatedAt: Date.now() }), Date.now());
    broadcast("people");
  }
  broadcast("roster");
  return true;
}
const inviteOk = req => { const c = cookies(req).inv; return !!c && safeEq(c, inviteToken()); };

const PAGE_CSS = `body{margin:0;font:16px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#EDF2EA;color:#13241B;display:grid;place-items:center;min-height:100vh;padding:16px;box-sizing:border-box}
.c{background:#FBFDF9;border:1px solid #D2DDCD;border-radius:20px;padding:28px 22px;max-width:420px;width:100%;box-shadow:0 8px 24px rgba(19,36,27,.08)}h1{margin:.1em 0 .2em;font-size:28px}p{color:#4B5E53;margin:.3em 0 1em}
a.b,button.b{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;min-height:52px;border-radius:14px;border:0;background:#1D5A3E;color:#F2F8F1;font:600 17px inherit;text-decoration:none;cursor:pointer;box-sizing:border-box}
input{width:100%;box-sizing:border-box;min-height:48px;border:1px solid #D2DDCD;border-radius:12px;padding:0 12px;font-size:16px;margin:8px 0}.s{font-size:13px;color:#6E8275;margin-top:12px}.or{text-align:center;color:#6E8275;margin:14px 0 4px;font-size:13px}`;
const shell = (title, inner) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${PAGE_CSS}</style></head><body><div class="c">${inner}</div></body></html>`;
function joinPage(req) {
  const g = GOOGLE_ID && GOOGLE_SECRET;
  return shell("Join Kerala Trip HQ", `<div style="font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#6E8275">22–26 December 2026</div><h1>Join Kerala Trip HQ</h1><p>Plan the trip with the crew: itinerary, votes, comments and expenses.</p>
${g ? `<a class="b" href="/auth/google">Continue with Google</a>` : ""}
${ALLOW_ANON ? `${g ? `<div class="or">or, without Google</div>` : ""}<form method="post" action="/auth/anon"><input name="name" maxlength="30" required placeholder="Your name" autocomplete="given-name"><button class="b" type="submit">Join with this name</button><div class="s">Name-only members are marked unverified. Use the same browser to come back.</div></form>` : ""}
${!g && !ALLOW_ANON ? `<p>Sign-in is not configured yet. Ask Bhargava.</p>` : ""}`);
}

/* ---- live updates ---- */
const clients = new Set();
function broadcast(col) { for (const c of clients) { try { c.write(`event: change\ndata: ${col}\n\n`); } catch (e) { clients.delete(c); } } }
setInterval(() => { for (const c of clients) { try { c.write(": ping\n\n"); } catch (e) { clients.delete(c); } } }, 25000).unref();
function kick(userId) { for (const c of clients) if (c.uid === userId) { try { c.write("event: revoked\ndata: 1\n\n"); c.end(); } catch (e) {} clients.delete(c); } }

/* ---- AI (administrator only) ---- */
async function runAI(prompt, wantJson) {
  const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "x-api-key": AI_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: AI_MODEL, max_tokens: 4096, messages: [{ role: "user", content: String(prompt).slice(0, 60000) }] }) });
  if (r.status === 429) throw Object.assign(new Error("rate"), { code: "rate_limited" });
  if (!r.ok) throw Object.assign(new Error("ai " + r.status), { code: "error" });
  const j = await r.json(); const text = (j.content || []).filter(b => b.type === "text").map(b => b.text).join("");
  if (!wantJson) return { text };
  const a = text.indexOf("{"), b = text.lastIndexOf("}");
  try { return { json: JSON.parse(text.slice(a, b + 1)) }; } catch (e) { throw Object.assign(new Error("json"), { code: "invalid_json" }); }
}

/* ---- request handling ---- */
const writeAllowed = (u, col, id) => u.isOwner || (col === "people" && id === u.id);
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon" };

async function handle(req, res) {
  const url = new URL(req.url, "http://x"); const p = url.pathname; const user = sessionUser(req);
  const active = user && user.status === "active" ? user : null;

  if (p === "/healthz") return send(res, 200, { ok: true });

  /* invite link */
  let m = p.match(/^\/join\/([\w-]+)$/);
  if (m) {
    if (!safeEq(m[1], inviteToken())) return send(res, 404, shell("Invite expired", `<h1>Invite link expired</h1><p>This link was replaced. Ask Bhargava for the new one.</p>`));
    const hdr = { "Set-Cookie": cookie("inv", m[1], 3600) };
    if (active) return redirect(res, "/", hdr);
    return send(res, 200, joinPage(req), hdr);
  }
  /* Google OAuth */
  if (p === "/auth/google") {
    if (!(GOOGLE_ID && GOOGLE_SECRET)) return send(res, 501, shell("Not configured", `<h1>Google sign-in is not set up</h1>`));
    const state = rand(16);
    const qs = new URLSearchParams({ client_id: GOOGLE_ID, redirect_uri: origin(req) + "/auth/google/callback", response_type: "code", scope: "openid profile email", state, prompt: "select_account" });
    return redirect(res, "https://accounts.google.com/o/oauth2/v2/auth?" + qs, { "Set-Cookie": cookie("gstate", state, 600) });
  }
  if (p === "/auth/google/callback") {
    const st = cookies(req).gstate;
    if (!st || !url.searchParams.get("code") || !safeEq(st, url.searchParams.get("state") || "")) return send(res, 400, shell("Sign-in failed", `<h1>Sign-in failed</h1><p>Please open the invite link again.</p>`));
    try {
      const tr = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ code: url.searchParams.get("code"), client_id: GOOGLE_ID, client_secret: GOOGLE_SECRET, redirect_uri: origin(req) + "/auth/google/callback", grant_type: "authorization_code" }) });
      const tj = await tr.json(); if (!tr.ok || !tj.id_token) throw new Error("token");
      const c = JSON.parse(Buffer.from(tj.id_token.split(".")[1], "base64url").toString("utf8"));
      const email = String(c.email || "").toLowerCase(); const isOwner = !!OWNER_EMAIL && email === OWNER_EMAIL && c.email_verified !== false;
      const existing = q.getMember.get("g_" + c.sub);
      if (!isOwner && !existing && !inviteOk(req)) return send(res, 403, shell("Invite needed", `<h1>Use the invite link</h1><p>Open the Kerala Trip HQ invite link from the group chat to join.</p>`));
      const ok = joinCrew({ id: "g_" + c.sub, name: c.name || c.given_name || "Traveller", picture: c.picture, verified: true, provider: "google" }, isOwner ? "owner" : "member");
      if (!ok) return send(res, 403, shell("Removed", `<h1>Access removed</h1><p>Bhargava removed you from this trip.</p>`));
      return redirect(res, "/", { "Set-Cookie": startSession(res, "g_" + c.sub, [cookie("gstate", "", 0), cookie("inv", "", 0)]) });
    } catch (e) { return send(res, 502, shell("Sign-in failed", `<h1>Sign-in failed</h1><p>Please try again.</p>`)); }
  }
  /* name-only join (unverified) */
  if (p === "/auth/anon" && req.method === "POST") {
    if (!ALLOW_ANON || !inviteOk(req)) return send(res, 403, shell("Invite needed", `<h1>Use the invite link</h1>`));
    const name = new URLSearchParams(await readBody(req, 2000)).get("name") || ""; if (!name.trim()) return redirect(res, "/");
    const id = "a_" + rand(12);
    joinCrew({ id, name: name.trim().slice(0, 30), verified: false, provider: "name" }, "member");
    return redirect(res, "/", { "Set-Cookie": startSession(res, id, [cookie("inv", "", 0)]) });
  }
  /* administrator claim by secret key */
  m = p.match(/^\/admin\/(.+)$/);
  if (m) {
    if (!ADMIN_KEY || !safeEq(decodeURIComponent(m[1]), ADMIN_KEY)) return send(res, 404, "Not found");
    const id = active ? active.id : "a_" + rand(12); const name = (active && active.name) || url.searchParams.get("name") || "Bhargava";
    joinCrew({ id, name, verified: !!(active && active.verified), provider: active ? "existing" : "admin-key" }, "owner");
    q.putMember.run(id, "owner", "active", Date.now()); q.putDoc.run("roster", id, JSON.stringify({ role: "owner", status: "active", at: Date.now() }), Date.now());
    return redirect(res, "/", active ? {} : { "Set-Cookie": startSession(res, id) });
  }
  if (p === "/auth/logout") { const sid = (cookies(req).sid || "").split(".")[0]; if (sid) q.delSession.run(sid); return redirect(res, "/", { "Set-Cookie": cookie("sid", "", 0) }); }

  /* API */
  if (p.startsWith("/api/")) {
    if (!user) return send(res, 401, { code: "signin" });
    if (!active) return send(res, 403, { code: "revoked" });
    if (p === "/api/me") return send(res, 200, { id: active.id, isOwner: active.isOwner, name: active.name, verified: active.verified, ai: !!AI_KEY && active.isOwner });
    if (p === "/api/profiles") {
      const ids = new Set((url.searchParams.get("ids") || "").split(",").filter(Boolean)); const out = {};
      q.allMembers.all().forEach(r => { if (ids.has(r.id)) out[r.id] = { name: r.name, avatarUrl: r.picture || "", verified: !!r.verified }; });
      return send(res, 200, out);
    }
    if (p === "/api/stream") {
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive", "X-Accel-Buffering": "no" });
      res.write("retry: 3000\n\n"); res.uid = active.id; clients.add(res); req.on("close", () => clients.delete(res)); return;
    }
    if (p === "/api/invite") { if (!active.isOwner) return send(res, 403, { code: "not_granted" }); return send(res, 200, { url: origin(req) + "/join/" + inviteToken() }); }
    if (p === "/api/invite/regenerate" && req.method === "POST") { if (!active.isOwner) return send(res, 403, { code: "not_granted" }); q.setSetting.run("invite", rand(18)); return send(res, 200, { url: origin(req) + "/join/" + inviteToken() }); }
    if (p === "/api/ai" && req.method === "POST") {
      if (!active.isOwner) return send(res, 403, { code: "not_granted" }); if (!AI_KEY) return send(res, 501, { code: "sampling_disabled" });
      try { const b = JSON.parse(await readBody(req, 200000)); return send(res, 200, await runAI(b.prompt, !!b.json)); }
      catch (e) { return send(res, e.code === "rate_limited" ? 429 : 502, { code: e.code || "error" }); }
    }
    m = p.match(/^\/api\/col\/(\w+)$/);
    if (m && req.method === "GET") {
      if (!COLLECTIONS.includes(m[1])) return send(res, 404, { code: "not_found" });
      return send(res, 200, q.listDocs.all(m[1]).map(r => ({ id: r.id, data: JSON.parse(r.data) })));
    }
    m = p.match(/^\/api\/doc\/(\w+)\/([\w:.@+~-]{1,200})$/);
    if (m && (req.method === "PUT" || req.method === "DELETE")) {
      const [, col, id] = m; if (!COLLECTIONS.includes(col)) return send(res, 404, { code: "not_found" });
      if (!writeAllowed(active, col, id)) return send(res, 403, { code: "invalid_argument" });
      if (req.method === "DELETE") { q.delDoc.run(col, id); }
      else {
        let data; try { data = JSON.parse(await readBody(req)); } catch (e) { return send(res, 400, { code: "invalid_argument" }); }
        if (!data || typeof data !== "object" || Array.isArray(data)) return send(res, 400, { code: "invalid_argument" });
        q.putDoc.run(col, id, JSON.stringify(data), Date.now());
        if (col === "roster" && id !== active.id) { /* removing or restoring a member takes effect on the server immediately */
          const tm = q.getMember.get(id); if (tm) { const st = data.status === "removed" ? "removed" : "active"; q.setStatus.run(st, id); if (st === "removed") { q.delUserSessions.run(id); kick(id); } }
        }
      }
      broadcast(col); return send(res, 200, { ok: true });
    }
    return send(res, 404, { code: "not_found" });
  }

  /* app */
  if (p === "/" || p === "/index.html") {
    if (!active) return send(res, 200, shell("Kerala Trip HQ", `<div style="font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#6E8275">22–26 December 2026</div><h1>Kerala Trip HQ</h1><p>${user ? "Your access was removed." : "This is a private trip planner. Open the invite link from the group chat to join."}</p>`));
    return send(res, 200, fs.readFileSync(path.join(__dirname, "public", "index.html")));
  }
  const file = path.join(__dirname, "public", path.normalize(p).replace(/^(\.\.[/\\])+/, ""));
  if (file.startsWith(path.join(__dirname, "public")) && p !== "/" && fs.existsSync(file) && fs.statSync(file).isFile() && p !== "/index.html") {
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-cache" }); return res.end(fs.readFileSync(file));
  }
  send(res, 404, "Not found");
}

http.createServer((req, res) => { handle(req, res).catch(e => { console.error(e); if (!res.headersSent) send(res, e.status || 500, { code: "error" }); else res.end(); }); }).listen(PORT, () => {
  console.log(`Kerala Trip HQ on :${PORT}`);
  console.log(`Invite link: ${BASE_URL || "http://localhost:" + PORT}/join/${inviteToken()}`);
  if (!(GOOGLE_ID && GOOGLE_SECRET) && !ALLOW_ANON) console.warn("Warning: neither Google sign-in nor ALLOW_ANON is configured; nobody can join.");
  const root = BASE_URL || "http://localhost:" + PORT;
  console.log(q.hasOwner.get() ? `Administrator exists. Re-claim from a new browser: ${root}/admin/${ADMIN_KEY}` : `NO ADMINISTRATOR YET. Open this once in your browser to become the administrator:\n  ${root}/admin/${ADMIN_KEY}`);
});

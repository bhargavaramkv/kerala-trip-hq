// Starts the server on a temp DB and checks the join flow end to end. Run with: node scripts/smoke.mjs
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
const port = 3900 + Math.floor(Math.random() * 90), B = `http://localhost:${port}`;
const p = spawn("node", ["server.js"], { env: { ...process.env, ADMIN_KEY: "k", ALLOW_ANON: "1", PORT: port, DATA_DIR: mkdtempSync(join(tmpdir(), "trip-")), ALLOW_ANON: "1", BASE_URL: B }, stdio: "ignore" });
const jar = {};
const call = async (who, path, opt = {}) => { const r = await fetch(B + path, { redirect: "manual", ...opt, headers: { cookie: jar[who] || "", ...(opt.headers || {}) } });
  const sc = r.headers.getSetCookie?.() || []; if (sc.length) jar[who] = [...new Map([...(jar[who] || "").split("; ").filter(Boolean), ...sc.map(c => c.split(";")[0])].map(c => [c.split("=")[0], c])).values()].join("; ");
  return r; };
try {
  for (let i = 0; i < 40; i++) { try { if ((await fetch(B + "/healthz")).ok) break; } catch {} await new Promise(r => setTimeout(r, 250)); }
  assert.equal((await call("a", "/api/me")).status, 401);
  await call("a", "/admin/k?name=Bhargava"); assert.equal((await (await call("a", "/api/me")).json()).isOwner, true);
  const inv = new URL((await (await call("a", "/api/invite")).json()).url).pathname;
  for (const n of ["Sahith", "Manoj"]) {
    await call(n, inv); const r = await call(n, "/auth/anon", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "name=" + n });
    assert.equal(r.status, 302); const me = await (await call(n, "/api/me")).json(); assert.equal(me.name, n); assert.equal(me.isOwner, false);
  }
  assert.equal((await call("x", "/auth/anon", { method: "POST", body: "name=Eve" })).status, 403);
  const sid = (await (await call("Sahith", "/api/me")).json()).id, mid = (await (await call("Manoj", "/api/me")).json()).id;
  const put = (who, path) => call(who, "/api/doc/" + path, { method: "PUT", headers: { "content-type": "application/json" }, body: "{}" });
  assert.equal((await put("Sahith", "people/" + sid)).status, 200);
  assert.equal((await put("Sahith", "people/" + mid)).status, 403);
  assert.equal((await put("Sahith", "bookings/x")).status, 403);
  await put("a", "roster/" + mid); await call("a", "/api/doc/roster/" + mid, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: "removed" }) });
  assert.equal((await call("Manoj", "/api/me")).status, 401);
  const old = inv; await call("a", "/api/invite/regenerate", { method: "POST" }); assert.equal((await call("z", old)).status, 404);
  console.log("smoke: ok");
} finally { p.kill(); }

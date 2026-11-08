/* Static mode. The app was written against a tiny `claude.use("db" | "user" | "sample")` surface; this file provides it
   from plain browser storage plus the read-only crew data published in data/state.json. No server, no accounts.
   - Everyone picks who they are (stored in this browser).
   - Your own votes, comments, suggestions and expenses are kept in this browser and shown immediately.
   - "Send my updates" files them as a GitHub issue; a workflow merges them into data/state.json, so everyone sees them. */
(function () {
  "use strict";
  const REPO = "bhargavaramkv/kerala-trip-hq";
  const NAMES = ["Bhargava", "Sahith", "Manoj"];
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} }
  };
  const slug = n => String(n).trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30) || "guest";
  const json = s => { try { return JSON.parse(s); } catch (e) { return null; } };
  const hash = s => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return String(h); };
  const err = code => Object.assign(new Error(code), { code });

  let base = { people: {}, roster: {}, reviews: {}, decisions: {}, itinerary: {}, bookings: {}, meta: {} };
  const listeners = {};
  const notify = () => Object.values(listeners).flat().forEach(f => f());
  async function loadBase() {
    try { const r = await fetch("data/state.json?t=" + Date.now(), { cache: "no-store" }); if (r.ok) { const j = await r.json(); if (j && typeof j === "object") base = Object.assign(base, j); } } catch (e) {}
    notify();
  }
  setInterval(loadBase, 60000);

  const who = () => json(store.get("tripWho"));
  const mine = () => { const w = who(); return w ? json(store.get("tripMine:" + w.id)) : null; };
  function saveMine(doc) { const w = who(); store.set("tripMine:" + w.id, JSON.stringify(doc)); notify(); }

  function pickWho() {
    return new Promise(resolve => {
      const css = "position:fixed;inset:0;z-index:99;background:#EDF2EA;display:grid;place-items:center;padding:16px;font:16px/1.5 system-ui,-apple-system,sans-serif;color:#13241B";
      const el = document.createElement("div"); el.style.cssText = css;
      const btn = "display:block;width:100%;min-height:58px;margin:10px 0;border:0;border-radius:14px;background:#1D5A3E;color:#F2F8F1;font:600 19px system-ui;cursor:pointer";
      el.innerHTML = `<div style="background:#FBFDF9;border:1px solid #D2DDCD;border-radius:20px;padding:26px 20px;max-width:400px;width:100%;box-sizing:border-box"><div style="font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#6E8275">22–26 December 2026</div><h1 style="margin:.1em 0 .2em;font-size:28px">Kerala Trip HQ</h1><p style="color:#4B5E53;margin:.2em 0 .8em">Who are you?</p>
        ${NAMES.map(n => `<button data-n="${n}" style="${btn}">I'm ${n}</button>`).join("")}
        <div style="font-size:13px;color:#6E8275;margin-top:10px">Someone else?</div><div style="display:flex;gap:8px"><input id="who-other" maxlength="30" placeholder="Your name" style="flex:1;min-height:48px;border:1px solid #D2DDCD;border-radius:12px;padding:0 12px;font-size:16px"><button id="who-go" style="min-height:48px;padding:0 16px;border:0;border-radius:12px;background:#1D5A3E;color:#F2F8F1;font:600 16px system-ui">Go</button></div></div>`;
      const done = name => { name = String(name || "").trim(); if (!name) return; const id = slug(name); store.set("tripWho", JSON.stringify({ id, name })); el.remove(); resolve({ id, name }); };
      el.addEventListener("click", e => { const n = e.target && e.target.getAttribute && e.target.getAttribute("data-n"); if (n) done(n); if (e.target && e.target.id === "who-go") done(el.querySelector("#who-other").value); });
      document.body.appendChild(el);
    });
  }
  const baseReady = loadBase();
  async function ensureWho() {
    await baseReady;
    let w = who(); if (!w) w = await pickWho();
    if (!mine()) { // first visit on this device: start from anything the crew data already holds for this person
      const b = base.people && base.people[w.id];
      saveMine(Object.assign({ nick: w.name, joinedAt: Date.now(), posts: [], expenses: [], votes: {}, reacts: {}, polls: {}, updatedAt: Date.now() }, b ? JSON.parse(JSON.stringify(b)) : {}));
    }
    return w;
  }

  function docs(col) {
    let out = Object.entries(base[col] || {}).map(([id, data]) => ({ id, data }));
    if (col === "people") { const w = who(), m = mine(); if (w && m) { out = out.filter(d => d.id !== w.id); out.push({ id: w.id, data: m }); } }
    return out;
  }
  const db = {
    collection(col) {
      return { onSnapshot(cb) {
        const f = () => cb({ docs: docs(col).map(d => ({ id: d.id, data: () => d.data })) });
        (listeners[col + Math.random()] = [f]); f(); return () => {};
      } };
    },
    doc(path) {
      const [col, id] = path.split("/"); const w = who();
      const ok = col === "people" && w && id === w.id;
      return { set: async data => { if (!ok) throw err("invalid_argument"); saveMine(data); }, delete: async () => { throw err("invalid_argument"); } };
    }
  };
  const user = {
    async me() { const w = await ensureWho(); return { id: w.id, isOwner: false, name: w.name }; },
    async can() { return true; },
    isOwner: () => false,
    async profiles(ids) { const out = {}; docs("people").forEach(d => { if (ids.includes(d.id)) out[d.id] = { name: d.data.nick || d.id, avatarUrl: "" }; }); return out; }
  };

  const api = {
    NAMES,
    who, repo: REPO,
    pending() { const m = mine(); return !!m && hash(JSON.stringify(m)) !== store.get("tripSent:" + who().id); },
    updatedAt: () => base.updated || 0,
    switchUser() { store.del("tripWho"); location.reload(); },
    sendUpdate() {
      const w = who(), m = mine(); const payload = { v: 1, who: w.id, name: w.name, doc: m };
      const text = JSON.stringify(payload); const title = "Crew update: " + w.name;
      const body = "```json\n" + text + "\n```";
      let url = `https://github.com/${REPO}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
      let pasted = false;
      if (url.length > 7500) { pasted = true; url = `https://github.com/${REPO}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent("Paste the copied update here, then press Submit.")}`; try { navigator.clipboard.writeText(body); } catch (e) {} }
      store.set("tripSent:" + w.id, hash(JSON.stringify(m)));
      return { url, pasted };
    }
  };
  window.claude = { static: api, async use(name) { if (name === "db") return db; if (name === "user") return user; return null; } };
})();

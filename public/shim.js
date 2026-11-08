/* Provides the small `claude.use("db" | "user" | "sample")` surface the app was written against,
   backed by this server (real sessions, SQLite, server-side AI) instead of the Claude artifact runtime. */
(function () {
  "use strict";
  const err = (code, status) => Object.assign(new Error(code), { code, status });
  async function api(url, opt) {
    const r = await fetch(url, Object.assign({ credentials: "same-origin" }, opt));
    let body = null; try { body = await r.json(); } catch (e) {}
    if (r.status === 401) { location.href = "/"; throw err("session_expired", 401); }
    if (!r.ok) throw err((body && body.code) || "error", r.status);
    return body;
  }
  const listeners = {}; let es = null;
  function stream() {
    if (es) return; es = new EventSource("/api/stream");
    es.addEventListener("change", e => { (listeners[e.data] || []).forEach(f => f()); });
    es.addEventListener("revoked", () => { Object.values(listeners).flat().forEach(f => f(true)); });
    es.onopen = () => { Object.values(listeners).flat().forEach(f => f()); };
  }
  function collection(col) {
    return {
      onSnapshot(cb, onErr) {
        let dead = false;
        const load = async revoked => {
          if (dead) return;
          try {
            if (revoked === true) throw err("revoked", 403);
            const rows = await api("/api/col/" + col);
            cb({ docs: rows.map(r => ({ id: r.id, data: () => r.data })) });
          } catch (e) { if (onErr) onErr({ code: e.code === "revoked" ? "revoked" : e.code || "error" }); }
        };
        (listeners[col] = listeners[col] || []).push(load); stream(); load();
        return () => { dead = true; listeners[col] = listeners[col].filter(f => f !== load); };
      }
    };
  }
  const db = {
    collection,
    doc(path) {
      const [col, id] = path.split("/"); const u = "/api/doc/" + col + "/" + encodeURIComponent(id);
      return {
        set: data => api(u, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(data) }),
        delete: () => api(u, { method: "DELETE" })
      };
    }
  };
  let meP = null; const me = () => (meP = meP || api("/api/me"));
  const user = {
    async me() { const m = await me(); return { id: m.id, isOwner: m.isOwner, name: m.name }; },
    async can() { return true; },
    isOwner: () => false,
    async profiles(ids) { return api("/api/profiles?ids=" + encodeURIComponent(ids.join(","))); }
  };
  async function ai(prompt, json, opts) {
    if (opts && opts.signal && opts.signal.aborted) throw err("cancelled");
    const p = api("/api/ai", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt, json }), signal: opts && opts.signal });
    try { return await p; } catch (e) { if (e.name === "AbortError") throw err("cancelled"); if (e.status === 403) throw err("not_granted"); throw e; }
  }
  async function sample(prompt, opts) { const r = await ai(typeof prompt === "string" ? prompt : JSON.stringify(prompt), false, opts); if (opts && opts.onText) opts.onText({ text: r.text, delta: r.text }); return { text: r.text, truncated: false }; }
  sample.json = async (prompt, opts) => (await ai(prompt, true, opts)).json;

  window.claude = {
    async use(name) {
      try {
        if (name === "db") return db;
        if (name === "user") return user;
        if (name === "sample") { const m = await me(); return m.ai ? sample : null; }
      } catch (e) {}
      return null;
    },
    inviteUrl: () => api("/api/invite"),
    regenerateInvite: () => api("/api/invite/regenerate", { method: "POST" })
  };
})();

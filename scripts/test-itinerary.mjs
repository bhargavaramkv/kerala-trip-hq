import assert from "node:assert/strict";
import { setDraft, promote, discard, status, stableId } from "./itinerary.mjs";
const mk = () => ({ itinerary: { v1: { n: 1, days: [{ key: "d1" }], status: "approved" }, v2: { n: 2, days: [{ key: "d1" }], status: "approved" } }, meta: { state: { current: "v2", stable: "v2" } } });
let st = mk();
assert.equal(stableId(st), "v2");
setDraft(st, [{ key: "d1", title: "x" }], "edit one", 1);
setDraft(st, [{ key: "d1", title: "y" }], "edit two", 2);               // overwrites, never adds versions
assert.deepEqual(Object.keys(st.itinerary).sort(), ["draft", "v1", "v2"]);
assert.equal(st.itinerary.draft.days[0].title, "y");
assert.equal(st.itinerary.draft.basedOn, "v2");
assert.equal(status(st).current, "draft"); assert.equal(status(st).stable, "v2");
const id = promote(st, 3);
assert.equal(id, "v3"); assert.equal(st.itinerary.v3.status, "approved"); assert.equal(st.itinerary.v3.n, 3);
assert.ok(!st.itinerary.draft); assert.equal(st.meta.state.current, "v3"); assert.equal(st.meta.state.stable, "v3");
assert.throws(() => promote(st), /no working draft/);
setDraft(st, [{ key: "d1" }], "again", 4); assert.equal(discard(st, 5), "v3");
assert.ok(!st.itinerary.draft); assert.equal(st.meta.state.current, "v3");
assert.throws(() => setDraft(mk(), [], "x"), /non-empty/);
console.log("itinerary tests: ok");

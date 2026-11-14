import assert from "node:assert/strict";
import { setDraft, promote, approve, discard, status, stableId } from "./itinerary.mjs";
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
// nothing stable yet: edits overwrite the single draft version in place, approve makes it stable
let n = { itinerary: { v1: { n: 1, days: [{ key: "d1", title: "a" }], status: "draft" } }, meta: { state: { current: "v1", stable: null } } };
assert.equal(stableId(n), null);
setDraft(n, [{ key: "d1", title: "b" }], "edit", 1); setDraft(n, [{ key: "d1", title: "c" }], "edit again", 2);
assert.deepEqual(Object.keys(n.itinerary), ["v1"]); assert.equal(n.itinerary.v1.days[0].title, "c"); assert.equal(n.itinerary.v1.status, "draft");
assert.equal(n.meta.state.current, "v1"); assert.equal(n.meta.state.stable, null);
assert.equal(approve(n, 3), "v1"); assert.equal(n.itinerary.v1.status, "approved"); assert.equal(n.meta.state.stable, "v1");
setDraft(n, [{ key: "d1", title: "d" }], "after approval", 4);        // now it goes to the working draft
assert.deepEqual(Object.keys(n.itinerary).sort(), ["draft", "v1"]); assert.equal(n.itinerary.v1.days[0].title, "c");
const empty = { itinerary: {}, meta: {} }; setDraft(empty, [{ key: "d1" }], "first"); assert.equal(empty.itinerary.v1.status, "draft");
console.log("itinerary tests: ok");

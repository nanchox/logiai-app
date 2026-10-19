import assert from "node:assert/strict";
import { test } from "node:test";
import { canHold, canPlanEvent } from "./types";

const base = { isAdmin: false, isHead: false, leaderSites: [], membership: null };
const ev = { siteId: "s1", groupId: "g1" };

test("quién puede planificar un servicio", () => {
  assert.ok(canPlanEvent({ ...base, isAdmin: true }, ev));
  assert.ok(canPlanEvent({ ...base, isHead: true }, ev));
  assert.ok(canPlanEvent({ ...base, leaderSites: [{ id: "s1" }] }, ev));
  assert.ok(!canPlanEvent({ ...base, leaderSites: [{ id: "s2" }] }, ev));
  assert.ok(canPlanEvent({ ...base, membership: { role: "coordinador", groupId: "g1" } }, ev));
  assert.ok(canPlanEvent({ ...base, membership: { role: "supervisor", groupId: "g1" } }, ev));
  assert.ok(!canPlanEvent({ ...base, membership: { role: "voluntario", groupId: "g1" } }, ev));
  assert.ok(!canPlanEvent({ ...base, membership: { role: "supervisor", groupId: "g2" } }, ev));
  assert.ok(!canPlanEvent({ ...base, membership: { role: "supervisor", groupId: "g1" } }, { siteId: "s1", groupId: null }));
});

test("quién puede ocupar una posición", () => {
  assert.ok(!canHold("coordinador", "voluntario"));
  assert.ok(!canHold("coordinador", "supervisor"));
  assert.ok(canHold("supervisor", "supervisor"));
  assert.ok(canHold("supervisor", "voluntario"));
  assert.ok(canHold("voluntario", "voluntario"));
  assert.ok(!canHold("voluntario", "supervisor"));
});

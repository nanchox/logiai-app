import assert from "node:assert/strict";
import { test } from "node:test";
import { effectiveQuota, quotaTotal } from "./quotas";

const std = [
  { entranceId: "izq", meetingId: "m1", quota: 1090 },
  { entranceId: "der", meetingId: "m1", quota: 656 },
  { entranceId: "izq", meetingId: "m2", quota: 900 },
];

test("effectiveQuota: ajuste del servicio, estándar o ninguno", () => {
  const m1 = { id: "m1", baseId: null }, m2 = { id: "m2", baseId: null };
  assert.deepEqual(effectiveQuota("izq", m1, std, []), { quota: 1090, adjusted: false, standard: 1090 });
  assert.deepEqual(effectiveQuota("izq", m1, std, [{ entranceId: "izq", meetingId: "m1", quota: 1000 }]), { quota: 1000, adjusted: true, standard: 1090 });
  assert.deepEqual(effectiveQuota("izq", m1, std, [{ entranceId: "izq", meetingId: "m1", quota: 1090 }]), { quota: 1090, adjusted: false, standard: 1090 }, "igual al estándar no es un ajuste");
  assert.deepEqual(effectiveQuota("der", m2, std, []), { quota: null, adjusted: false, standard: null }, "sin cupo en esa reunión");
});

test("effectiveQuota: una reunión personalizada hereda el cupo de la estándar de la que viene", () => {
  const custom = { id: "c1", baseId: "m1" }, nueva = { id: "c9", baseId: null };
  assert.equal(effectiveQuota("izq", custom, std, []).quota, 1090);
  assert.equal(effectiveQuota("izq", custom, std, [{ entranceId: "izq", meetingId: "c1", quota: 500 }]).quota, 500);
  assert.equal(effectiveQuota("izq", nueva, std, []).quota, null, "una reunión nueva no tiene cupo estándar");
});

test("quotaTotal suma los cupos efectivos; sin cupo cuenta 0", () => {
  assert.equal(quotaTotal(["izq", "der"], { id: "m1", baseId: null }, std, []), 1746);
  assert.equal(quotaTotal(["izq", "der"], { id: "m2", baseId: null }, std, []), 900);
  assert.equal(quotaTotal(["izq", "der"], { id: "m1", baseId: null }, std, [{ entranceId: "der", meetingId: "m1", quota: 700 }]), 1790);
  assert.equal(quotaTotal([], { id: "m1", baseId: null }, std, []), 0);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { formatDate, formatDateTime, fromInputValue, toInputValue } from "./dates";

test("la hora se escribe y se lee en hora de Colombia (UTC-5), vaya a donde vaya el servidor", () => {
  // 08:30 en Bogotá = 13:30 UTC
  assert.equal(fromInputValue("2026-10-20T08:30"), "2026-10-20T13:30:00.000Z");
  assert.equal(toInputValue("2026-10-20T13:30:00.000Z"), "2026-10-20T08:30");
});

test("ida y vuelta sin cambios, también cerca de la medianoche y al cambiar de día", () => {
  for (const v of ["2026-01-01T00:00", "2026-12-31T23:59", "2026-10-20T19:05", "2027-02-28T22:30"]) {
    assert.equal(toInputValue(fromInputValue(v)!), v);
  }
  // 21:30 en Bogotá ya es el día siguiente en UTC
  assert.equal(fromInputValue("2026-10-20T21:30"), "2026-10-21T02:30:00.000Z");
  assert.equal(toInputValue("2026-10-21T02:30:00.000Z"), "2026-10-20T21:30");
});

test("valores vacíos o inválidos dan nulo", () => {
  for (const v of ["", "mañana", "2026-10-20", "2026-13-40T99:99", "2026-10-20 08:30"]) assert.equal(fromInputValue(v), null, v);
  assert.equal(toInputValue(null), "");
});

test("se muestran en español y en hora de Colombia", () => {
  const s = formatDateTime("2026-10-20T13:30:00.000Z");
  assert.match(s, /20/); assert.match(s, /oct/i); assert.match(s, /8:30/);
  assert.match(formatDate("2026-10-21T02:30:00.000Z"), /20/);   // aún es 20 en Bogotá
});

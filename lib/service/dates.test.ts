import assert from "node:assert/strict";
import { test } from "node:test";
import { addDays, formatServiceDate, isDate, todayCo } from "./dates";

test("hoy se calcula en hora de Colombia (UTC-5)", () => {
  assert.equal(todayCo(new Date("2026-10-18T04:59:00Z")), "2026-10-17");
  assert.equal(todayCo(new Date("2026-10-18T05:00:00Z")), "2026-10-18");
});

test("sumar días cruza meses y años; las fechas no cambian de día por la zona", () => {
  assert.equal(addDays("2030-01-06", 7), "2030-01-13");
  assert.equal(addDays("2030-12-29", 7), "2031-01-05");
  assert.equal(addDays("2030-03-01", -1), "2030-02-28");
  assert.match(formatServiceDate("2030-01-06"), /^Domingo, 6 de enero de 2030$/);
});

test("valida fechas de calendario", () => {
  assert.ok(isDate("2030-02-28"));
  assert.ok(!isDate("2030-02-30"));
  assert.ok(!isDate("30/02/2030"));
  assert.ok(!isDate(""));
});

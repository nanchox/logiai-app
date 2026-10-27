import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSiteReport, weekTotal } from "./report";
import { canCountNow, countWindow } from "./window";
import type { ServiceEvent } from "@/lib/service/types";
import type { CountLocation, CountRow } from "./types";

const ev = (id: string, date: string, shift: string, o: Partial<ServiceEvent> = {}): ServiceEvent => ({
  id, slotId: "s", siteId: "A", siteName: "Sede A", siteSlug: "a", day: "domingo", shift, date, groupId: "g", groupName: "G1", kind: "rotacion", manual: false, status: "programado",
  cancelReason: null, note: null, ...o,
});
const locs: CountLocation[] = [
  { id: "aud", siteId: "A", name: "Auditorio", kind: "auditorio", capacity: 500, sort: 1 },
  { id: "teat", siteId: "A", name: "Teatro", kind: "teatro", capacity: 100, sort: 2 },
  { id: "otra", siteId: "B", name: "Otra sede", kind: "auditorio", capacity: 50, sort: 1 },
];
const TODAY = "2030-01-13";

test("un servicio suma lo contado y compara con la capacidad de lo contado (no penaliza ubicaciones sin uso)", () => {
  const counts: CountRow[] = [{ eventId: "e1", locationId: "aud", total: 400 }];
  const r = buildSiteReport("A", "Sede A", [ev("e1", "2030-01-13", "am")], counts, locs, TODAY);
  const s = r.days[0].services[0];
  assert.equal(s.total, 400);
  assert.equal(s.capacity, 500, "el teatro no se contó: no suma capacidad");
  assert.equal(s.occupancy, 80);
  assert.deepEqual(s.items.map((i) => [i.name, i.total]), [["Auditorio", 400], ["Teatro", null]], "solo ubicaciones de la sede, en orden, con null si no hay dato");
  assert.equal(s.pending, false);
});

test("pendiente: ya pasó o es hoy, está programado y no tiene totales; lo futuro y lo cancelado no", () => {
  const events = [ev("hoy", "2030-01-13", "am"), ev("ayer", "2030-01-12", "am"), ev("manana", "2030-01-14", "am"), ev("canc", "2030-01-11", "am", { status: "cancelado" }), ev("ok", "2030-01-10", "am")];
  const r = buildSiteReport("A", "Sede A", events, [{ eventId: "ok", locationId: "aud", total: 1 }], locs, TODAY);
  const p = (id: string) => r.days.flatMap((d) => d.services).find((s) => s.event.id === id)!.pending;
  assert.deepEqual(["hoy", "ayer", "manana", "canc", "ok"].map(p), [true, true, false, false, false]);
  assert.equal(r.pending, 2);
  assert.equal(r.services, 4, "los cancelados no cuentan como servicios");
  assert.equal(r.counted, 1);
});

test("el día y la semana suman sus servicios (varios horarios); sin datos no hay porcentaje", () => {
  const events = [ev("am", "2030-01-13", "am"), ev("pm", "2030-01-13", "pm"), ev("mie", "2030-01-09", "unica", { day: "miercoles" })];
  const counts: CountRow[] = [
    { eventId: "am", locationId: "aud", total: 300 }, { eventId: "am", locationId: "teat", total: 100 },
    { eventId: "pm", locationId: "aud", total: 250 },
  ];
  const r = buildSiteReport("A", "Sede A", events, counts, locs, TODAY);
  assert.deepEqual(r.days.map((d) => d.date), ["2030-01-09", "2030-01-13"], "ordenados por fecha");
  const dom = r.days[1];
  assert.equal(dom.total, 650);
  assert.equal(dom.capacity, 1100, "am: 500+100, pm: 500");
  assert.equal(dom.occupancy, 59.1);
  assert.equal(r.days[0].occupancy, null, "el miércoles no tiene conteos");
  assert.equal(r.total, 650);
  assert.equal(r.occupancy, 59.1);
  assert.equal(weekTotal("A", events, counts), 650);
  assert.equal(weekTotal("B", events, counts), 0, "otra sede");
});

test("el reporte de una sede ignora los servicios de otras", () => {
  const events = [ev("a1", "2030-01-13", "am"), ev("b1", "2030-01-13", "am", { siteId: "B", siteName: "Sede B" })];
  const counts: CountRow[] = [{ eventId: "a1", locationId: "aud", total: 10 }, { eventId: "b1", locationId: "otra", total: 20 }];
  assert.equal(buildSiteReport("A", "Sede A", events, counts, locs, TODAY).total, 10);
  assert.equal(buildSiteReport("B", "Sede B", events, counts, locs, TODAY).total, 20);
});

test("plazo de captura: desde el día del servicio; quien planifica hasta el final del día siguiente; el líder sin límite", () => {
  assert.equal(countWindow("2030-01-13", "2030-01-12"), "pronto");
  assert.equal(countWindow("2030-01-13", "2030-01-13"), "abierto");
  assert.equal(countWindow("2030-01-13", "2030-01-14"), "abierto");
  assert.equal(countWindow("2030-01-13", "2030-01-15"), "cerrado");
  assert.equal(countWindow("2030-12-31", "2031-01-01"), "abierto", "cruza el año");
  assert.equal(canCountNow("2030-01-13", "2030-01-12", true), false, "ni el líder antes del día");
  assert.equal(canCountNow("2030-01-13", "2030-01-15", false), false);
  assert.equal(canCountNow("2030-01-13", "2030-01-15", true), true);
  assert.equal(canCountNow("2030-01-13", "2030-01-14", false), true);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { activeServices, pickActive } from "./active";
import type { ServiceEvent } from "./types";
import type { SupportEvent } from "@/lib/support/types";

const ev = (id: string, date: string, o: Partial<ServiceEvent> = {}): ServiceEvent => ({
  id, slotId: "s1", siteId: "A", siteName: "Sede A", siteSlug: "a", day: "sabado", shift: "pm", date, groupId: "g1", groupName: "G1", kind: "rotacion", manual: false,
  status: "programado", cancelReason: null, note: null, ...o,
});
const TODAY = "2030-01-12";

test("activos: lo de hoy y el siguiente; no lo pasado ni lo cancelado", () => {
  const events = [ev("pasado", "2030-01-05"), ev("hoy", TODAY), ev("sig", "2030-01-19"), ev("mas", "2030-01-26"), ev("canc", "2030-01-15", { status: "cancelado" })];
  assert.deepEqual(pickActive(events, TODAY, () => "k").map((e) => e.id), ["hoy"], "si hoy hay servicio, ese es el activo y el siguiente aún no");
  const sinHoy = [ev("pasado", "2030-01-05"), ev("canc", "2030-01-13", { status: "cancelado" }), ev("sig", "2030-01-19"), ev("mas", "2030-01-26")];
  assert.deepEqual(pickActive(sinHoy, TODAY, () => "k").map((e) => e.id), ["sig"], "sin servicio hoy, el siguiente programado (saltando el cancelado)");
  assert.deepEqual(pickActive([], TODAY, () => "k"), []);
});

test("hay un siguiente por cada clave; los de hoy se suman a ellos", () => {
  const events = [ev("a1", "2030-01-19", { slotId: "x" }), ev("a2", "2030-01-26", { slotId: "x" }), ev("b1", TODAY, { slotId: "y" }), ev("b2", "2030-01-13", { slotId: "y" }), ev("c1", "2030-01-14", { slotId: "z" })];
  assert.deepEqual(pickActive(events, TODAY, (e) => e.slotId).map((e) => e.id).sort(), ["a1", "b1", "c1"]);
  // Dos servicios hoy en el mismo horario clave: ambos son activos
  const dos = [ev("h1", TODAY, { id: "h1" }), ev("h2", TODAY, { id: "h2" }), ev("f", "2030-01-19")];
  assert.deepEqual(pickActive(dos, TODAY, () => "k").map((e) => e.id), ["h1", "h2"]);
});

test("una persona de un grupo: el de hoy o el siguiente de SU grupo; un supervisor del grupo igual", () => {
  const events = [ev("otro", "2030-01-13", { groupId: "g2" }), ev("mio1", "2030-01-19"), ev("mio2", "2030-01-26")];
  const r = activeServices({ events, supports: [], today: TODAY, groupId: "g1", staff: false });
  assert.deepEqual(r.map((i) => [i.eventId, i.kind, i.isToday]), [["mio1", "grupo", false]]);
  assert.deepEqual(activeServices({ events, supports: [], today: TODAY, groupId: null, staff: false }), [], "sin grupo, sin servicios propios");
  const hoy = activeServices({ events: [ev("mio0", TODAY), ...events], supports: [], today: TODAY, groupId: "g1", staff: false });
  assert.deepEqual(hoy.map((i) => [i.eventId, i.isToday]), [["mio0", true]]);
});

test("quien acompaña a los grupos (líder, cabeza, administrador): hoy en su alcance y el siguiente de cada horario", () => {
  const events = [
    ev("cas-hoy", TODAY, { slotId: "cas-sab" }), ev("cas-sig", "2030-01-19", { slotId: "cas-sab" }),
    ev("cas-dom1", "2030-01-13", { slotId: "cas-dom", day: "domingo" }), ev("cas-dom2", "2030-01-20", { slotId: "cas-dom", day: "domingo" }),
  ];
  const r = activeServices({ events, supports: [], today: TODAY, groupId: null, staff: true });
  assert.deepEqual(r.map((i) => [i.eventId, i.kind]), [["cas-hoy", "sede"], ["cas-dom1", "sede"]]);
});

test("un apoyo suma su servicio de hoy o el siguiente en el que apoya, sin repetir", () => {
  const sup = (id: string, date: string, status = "programado"): SupportEvent => ({ eventId: id, date, siteName: "Sede A", day: "domingo", shift: "am", groupName: "Otro", source: "directo", status });
  const events = [ev("mio1", "2030-01-19")];
  const r = activeServices({ events, supports: [sup("ap1", "2030-01-13"), sup("ap2", "2030-01-20"), sup("ap0", "2030-01-05"), sup("apc", "2030-01-14", "cancelado")], today: TODAY, groupId: "g1", staff: false });
  assert.deepEqual(r.map((i) => [i.eventId, i.kind]), [["ap1", "apoyo"], ["mio1", "grupo"]], "el siguiente apoyo (no el pasado ni el cancelado), junto al de su grupo, por fecha");
  const igual = activeServices({ events, supports: [sup("mio1", "2030-01-19")], today: TODAY, groupId: "g1", staff: false });
  assert.deepEqual(igual.map((i) => i.eventId), ["mio1"], "no se repite");
});

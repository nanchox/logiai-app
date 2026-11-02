import assert from "node:assert/strict";
import { test } from "node:test";
import { balanceMessage, balanceOf, zoneReservedSeats } from "./balance";

const m1 = { id: "m1", baseId: null, time: "13:00" }, m2 = { id: "m2", baseId: null, time: "19:00" };
const std = [{ entranceId: "izq", meetingId: "m1", quota: 1090 }, { entranceId: "der", meetingId: "m1", quota: 656 }, { entranceId: "izq", meetingId: "m2", quota: 900 }];

test("zoneReservedSeats: ajuste de la reunión > ajuste de todas > predeterminado de la reunión > predeterminado del día", () => {
  const defaults = [{ zoneId: "z", day: "sabado", meetingId: null, seats: 10 }, { zoneId: "z", day: "sabado", meetingId: "m1", seats: 14 }];
  assert.equal(zoneReservedSeats("z", m1, "sabado", defaults, []), 14);
  assert.equal(zoneReservedSeats("z", m2, "sabado", defaults, []), 10, "sin el de la reunión, el del día");
  assert.equal(zoneReservedSeats("z", m1, "domingo", defaults, []), 0, "otro día no aplica");
  assert.equal(zoneReservedSeats("z", m1, "sabado", defaults, [{ zoneId: "z", meetingId: null, seats: 3 }]), 3, "el ajuste del servicio para todas");
  assert.equal(zoneReservedSeats("z", m1, "sabado", defaults, [{ zoneId: "z", meetingId: null, seats: 3 }, { zoneId: "z", meetingId: "m1", seats: 5 }]), 5, "el de la reunión gana");
  assert.equal(zoneReservedSeats("z", { id: "c1", baseId: "m1" }, "sabado", defaults, []), 14, "una reunión personalizada hereda de su estándar");
  assert.equal(zoneReservedSeats("otra", m1, "sabado", defaults, []), 0);
});

const base = { entranceIds: ["izq", "der"], zoneIds: ["z1", "z2"], day: "sabado", standardQuotas: std, eventQuotas: [], defaults: [], overrides: [], roleReservations: [] };

test("balanceOf: cupos + reservas frente al aforo", () => {
  // 1090 + 656 = 1746; aforo 1800 → faltan 54
  let b = balanceOf({ ...base, capacity: 1800, meeting: m1 });
  assert.deepEqual([b.quotas, b.total, b.diff, b.status], [1746, 1746, 54, "faltan"]);
  // + reservas de zona 30 + del rol 24 = 1800 → cuadra
  b = balanceOf({ ...base, capacity: 1800, meeting: m1, defaults: [{ zoneId: "z1", day: "sabado", meetingId: null, seats: 30 }], roleReservations: [{ zoneId: "z2", meetingTime: null, seats: 24 }] });
  assert.deepEqual([b.zoneReserved, b.roleReserved, b.total, b.status], [30, 24, 1800, "cuadra"]);
  assert.equal(balanceMessage(b), "Cuadra con el aforo");
  // se pasa → sobran
  b = balanceOf({ ...base, capacity: 1700, meeting: m1 });
  assert.deepEqual([b.diff, b.status], [-46, "sobran"]);
  assert.equal(balanceMessage(b), "Sobran 46: se pasa del aforo");
  assert.equal(balanceMessage(balanceOf({ ...base, capacity: 2000, meeting: m1 })), "Faltan 254 por asignar");
});

test("balanceOf: por reunión; reservas del rol de otra hora o de otra zona no cuentan", () => {
  const b2 = balanceOf({ ...base, capacity: 1000, meeting: m2 });
  assert.equal(b2.quotas, 900, "a las 7 pm solo hay el cupo de la izquierda");
  assert.equal(b2.diff, 100);
  const roles = [
    { zoneId: "z1", meetingTime: "13:00:00", seats: 5 },   // solo la 1 pm (la base de datos devuelve HH:MM:SS)
    { zoneId: "z1", meetingTime: null, seats: 7 },         // todas
    { zoneId: "zX", meetingTime: null, seats: 99 },        // otra ubicación
  ];
  assert.equal(balanceOf({ ...base, capacity: 5000, meeting: m1, roleReservations: roles }).roleReserved, 12);
  assert.equal(balanceOf({ ...base, capacity: 5000, meeting: m2, roleReservations: roles }).roleReserved, 7);
});

test("balanceOf: sin aforo registrado", () => {
  const b = balanceOf({ ...base, capacity: null, meeting: m1 });
  assert.equal(b.status, "sin-aforo");
  assert.equal(balanceMessage(b), "Sin aforo registrado");
});

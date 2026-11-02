import assert from "node:assert/strict";
import { test } from "node:test";
import { addTap, canDecrement, canIncrement, displayCount, flush, level, prepareSend } from "./queue";

test("displayCount: servidor + pendientes, sin bajar de cero ni pasar del máximo", () => {
  assert.equal(displayCount(10, [], 50), 10);
  assert.equal(displayCount(10, [{ id: "a", delta: 3 }, { id: "b", delta: -1 }], 50), 12);
  assert.equal(displayCount(48, [{ id: "a", delta: 9 }], 50), 50, "no pasa del cupo");
  assert.equal(displayCount(2, [{ id: "a", delta: -9 }], 50), 0, "no baja de cero");
  assert.equal(displayCount(60, [], 50), 60, "si el servidor ya está por encima (cupo bajado), se muestra lo real");
  assert.equal(displayCount(60, [{ id: "a", delta: 1 }], 50), 60, "y no sube más");
  assert.equal(displayCount(5, [{ id: "a", delta: 1000 }], null), 1005, "sin cupo no hay tope");
});

test("addTap y prepareSend", () => {
  let n = 0; const id = () => `op${++n}`;
  let q = addTap([], 1, id); q = addTap(q, 1, id); q = addTap(q, 1, id);
  assert.equal(q.length, 3);
  assert.deepEqual(prepareSend(q), [{ id: "op1", delta: 3, tried: true }], "los toques nuevos se juntan en una sola operación");
  assert.deepEqual(prepareSend(addTap(addTap([], 1, id), -1, id)), [], "un +1 y un −1 se anulan");
  assert.deepEqual(addTap([], 0, id), []);
  // Lo ya intentado se reenvía tal cual: no se le suman toques nuevos (el servidor ignoraría el identificador repetido)
  const retry = [{ id: "x", delta: 3, tried: true }, { id: "y", delta: 1 }, { id: "z", delta: 1 }];
  assert.deepEqual(prepareSend(retry), [{ id: "x", delta: 3, tried: true }, { id: "y", delta: 2, tried: true }]);
});

test("canIncrement, canDecrement y level", () => {
  assert.equal(canIncrement(49, 50), true);
  assert.equal(canIncrement(50, 50), false);
  assert.equal(canIncrement(999, null), true);
  assert.equal(canDecrement(0), false);
  assert.equal(canDecrement(1), true);
  assert.deepEqual([level(10, 100), level(90, 100), level(99, 100), level(100, 100), level(5, null), level(5, 0)], ["ok", "cerca", "cerca", "tope", "ok", "ok"]);
});

test("flush: envía en orden, se detiene sin red y conserva lo pendiente", async () => {
  const q = [{ id: "a", delta: 2 }, { id: "b", delta: 3 }, { id: "c", delta: -1 }];
  const sent: string[] = [];
  let total = 0;
  const ok = async (op: { id: string; delta: number }) => { sent.push(op.id); total += op.delta; return { ok: true as const, count: total }; };
  let r = await flush(q, ok);
  assert.deepEqual(sent, ["a", "b", "c"]);
  assert.deepEqual([r.remaining, r.serverCount, r.rejected], [[], 4, null]);
  // Sin señal en la segunda: la primera pasó, las otras quedan
  sent.length = 0; total = 0;
  r = await flush(q, async (op) => (op.id === "b" ? { ok: false as const, network: true, message: "sin red" } : ok(op)));
  assert.deepEqual(r.remaining.map((o) => o.id), ["b", "c"]);
  assert.equal(r.serverCount, 2);
  assert.equal(r.rejected, null);
  // El servidor rechaza una (sin permiso): se descarta y se sigue con las demás
  total = 0;
  r = await flush(q, async (op) => (op.id === "b" ? { ok: false as const, network: false, message: "No puedes contar en esta entrada" } : ok(op)));
  assert.deepEqual([r.remaining, r.serverCount, r.rejected], [[], 1, "No puedes contar en esta entrada"]);
});

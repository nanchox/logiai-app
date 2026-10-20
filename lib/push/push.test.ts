import assert from "node:assert/strict";
import { test } from "node:test";
import { pendingCountsPayload, supportRequestPayload, testPayload } from "./payloads";
import { sendAll, type PushSub } from "./send";

test("los avisos solo dicen qué hay que hacer: sin nombres ni correos", () => {
  const a = supportRequestPayload("r1", { group_name: "Grupo 1", service_date: "2030-01-13", needed: 3, filled: 1, site_name: "Castellana" });
  assert.equal(a.title, "Piden apoyo en tu sede");
  assert.match(a.body, /Grupo 1 necesita 2 personas · /);
  assert.equal(a.url, "/servicio");
  assert.equal(a.tag, "support-r1");
  assert.match(supportRequestPayload("r", { group_name: "G", service_date: "2030-01-13", needed: 1, filled: 0, site_name: "S" }).body, /necesita 1 persona ·/);
  assert.match(supportRequestPayload("r", { group_name: "G", service_date: "2030-01-13", needed: 2, filled: 2, site_name: "S" }).body, /necesita 1 persona ·/, "nunca dice 0");
  const c = pendingCountsPayload({ event_id: "e1", service_date: "2030-01-13", site_name: "Castellana", day: "domingo", shift: "am" });
  assert.equal(c.title, "Faltan los conteos del servicio");
  assert.match(c.body, /Castellana · Domingo AM · /);
  assert.equal(c.url, "/servicio/e1");
  assert.equal(testPayload().url, "/perfil");
  for (const p of [a, c, testPayload()]) assert.ok(!/@/.test(JSON.stringify(p)), "sin correos");
});

const sub = (n: number): PushSub => ({ id: `s${n}`, endpoint: `https://push.example/${n}`, p256dh: "k", auth: "a" });

test("enviar: cuenta los enviados, los fallidos y los dispositivos que ya no existen; uno que falla no impide los demás", async () => {
  const sender = async (s: PushSub) => {
    if (s.id === "s2") return { gone: true };
    if (s.id === "s3") throw new Error("caído");
    return {};
  };
  const r = await sendAll([sub(1), sub(2), sub(3), sub(4)], testPayload(), sender);
  assert.deepEqual(r, { sent: 2, failed: 1, goneIds: ["s2"] });
  assert.deepEqual(await sendAll([], testPayload(), sender), { sent: 0, failed: 0, goneIds: [] });
});

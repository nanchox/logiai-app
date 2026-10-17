import { test } from "node:test";
import assert from "node:assert/strict";
import { splitLinks } from "./linkify";

const links = (t: string) => splitLinks(t).filter((p) => p.type === "link").map((p) => p.value);

test("detecta enlaces dentro del texto y conserva el resto", () => {
  assert.deepEqual(splitLinks("Mira https://youtu.be/abc ahora"), [
    { type: "text", value: "Mira " }, { type: "link", value: "https://youtu.be/abc" }, { type: "text", value: " ahora" },
  ]);
  assert.deepEqual(splitLinks("sin enlaces"), [{ type: "text", value: "sin enlaces" }]);
  assert.deepEqual(splitLinks(""), []);
});

test("la puntuación al final no entra en el enlace", () => {
  assert.deepEqual(links("Ver https://a.co/x. Luego (https://b.co/y), y https://c.co/z!"), ["https://a.co/x", "https://b.co/y", "https://c.co/z"]);
  assert.equal(splitLinks("fin https://a.co/x.").map((p) => p.value).join(""), "fin https://a.co/x.");   // no se pierde nada
});

test("varios enlaces, con saltos de línea y parámetros", () => {
  assert.deepEqual(links("https://a.co/p?x=1&y=2\nhttps://b.co/#frag\thttp://c.co"), ["https://a.co/p?x=1&y=2", "https://b.co/#frag", "http://c.co"]);
});

test("otros esquemas no son enlaces (javascript:, data:, ftp:)", () => {
  assert.deepEqual(links("javascript:alert(1) data:text/html,<b> ftp://x.co mailto:a@b.co"), []);
  assert.deepEqual(links("<script>https://ok.co</script>"), ["https://ok.co"]);   // el HTML nunca se interpreta: React lo escapa
});

test("el texto reconstruido es idéntico al original", () => {
  for (const t of ["a https://x.co/y. b", "https://x.co", "texto (https://x.co/a) fin", "http://", "https:// vacío"])
    assert.equal(splitLinks(t).map((p) => p.value).join(""), t, t);
});

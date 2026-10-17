import { test } from "node:test";
import assert from "node:assert/strict";
import { parseEmails } from "./emails";

test("separa por comas, punto y coma, espacios y saltos de línea (como pega la gente desde Excel o WhatsApp)", () => {
  const r = parseEmails("ana@gmail.com, luis@gmail.com;marta@x.org\nPedro@Hotmail.com   sofia@x.co\r\n\tjuan@x.com");
  assert.deepEqual(r.valid, ["ana@gmail.com", "luis@gmail.com", "marta@x.org", "pedro@hotmail.com", "sofia@x.co", "juan@x.com"]);
  assert.deepEqual(r.invalid, []);
});

test("entiende «Nombre <correo>» y paréntesis, y quita el punto final de una frase", () => {
  assert.deepEqual(parseEmails('Ana Pérez <ana@gmail.com>, "Luis" <luis@x.com>; (marta@x.org). pedro@x.com.').valid, ["ana@gmail.com", "luis@x.com", "marta@x.org", "pedro@x.com"]);
});

test("normaliza a minúsculas y elimina repetidos", () => {
  assert.deepEqual(parseEmails("ANA@Gmail.com ana@gmail.com Ana@GMAIL.COM").valid, ["ana@gmail.com"]);
});

test("separa los correos inválidos para informarlos", () => {
  const r = parseEmails("ana@gmail.com juan@sinpunto @x.com luis@x pedro@x.c ok@x.io");
  assert.deepEqual(r.valid, ["ana@gmail.com", "ok@x.io"]);
  assert.deepEqual(r.invalid.sort(), ["@x.com", "juan@sinpunto", "luis@x", "pedro@x.c"].sort());
});

test("texto sin correos no da nada", () => {
  assert.deepEqual(parseEmails("hola, sin correos aquí\n\n"), { valid: [], invalid: [] });
  assert.deepEqual(parseEmails(""), { valid: [], invalid: [] });
});

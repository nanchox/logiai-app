import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { getSupabaseConfig } from "./env";

const NAMES = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"] as const;
const saved = Object.fromEntries(NAMES.map((n) => [n, process.env[n]]));
afterEach(() => {
  for (const n of NAMES) {
    if (saved[n] === undefined) delete process.env[n];
    else process.env[n] = saved[n];
  }
});
const setEnv = (v: Partial<Record<(typeof NAMES)[number], string>>) => {
  for (const n of NAMES) delete process.env[n];
  Object.assign(process.env, v);
};

test("lee la URL y la clave, sin espacios sobrantes", () => {
  setEnv({ NEXT_PUBLIC_SUPABASE_URL: "  https://abc.supabase.co\n", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: " sb_publishable_x " });
  assert.deepEqual(getSupabaseConfig(), { url: "https://abc.supabase.co", key: "sb_publishable_x" });
});

test("prefiere la clave publishable y acepta la anon como alternativa", () => {
  setEnv({ NEXT_PUBLIC_SUPABASE_URL: "https://a.co", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "pub", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon" });
  assert.equal(getSupabaseConfig().key, "pub");
  setEnv({ NEXT_PUBLIC_SUPABASE_URL: "https://a.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon" });
  assert.equal(getSupabaseConfig().key, "anon");
  setEnv({ NEXT_PUBLIC_SUPABASE_URL: "https://a.co", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "   ", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon" });
  assert.equal(getSupabaseConfig().key, "anon", "una variable vacía se ignora");
});

test("si falta algo, el error dice cuál variable y qué hacer", () => {
  setEnv({ NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "k" });
  assert.throws(() => getSupabaseConfig(), /NEXT_PUBLIC_SUPABASE_URL[\s\S]*Vercel[\s\S]*desplegar/);
  setEnv({ NEXT_PUBLIC_SUPABASE_URL: "https://a.co" });
  assert.throws(() => getSupabaseConfig(), /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
  setEnv({ NEXT_PUBLIC_SUPABASE_URL: "   ", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "k" });
  assert.throws(() => getSupabaseConfig(), /NEXT_PUBLIC_SUPABASE_URL/, "una URL en blanco cuenta como faltante");
});

test("importar la configuración no falla aunque falten variables (se valida al usarla)", () => {
  setEnv({});
  assert.equal(typeof getSupabaseConfig, "function");
});

// Next.js solo incrusta NEXT_PUBLIC_* en el navegador con acceso literal. process.env[nombre] llega vacío
// al cliente aunque la variable exista en Vercel (así falló la primera publicación).
test("ningún archivo de la app usa acceso dinámico a process.env", () => {
  const roots = ["app", "lib", "components", "proxy.ts"];
  const offenders: string[] = [];
  const walk = (path: string) => {
    if (statSync(path).isDirectory()) return readdirSync(path).forEach((f) => walk(join(path, f)));
    if (!/\.(ts|tsx)$/.test(path) || /\.test\.ts$/.test(path)) return;
    readFileSync(path, "utf8").split("\n").forEach((line, i) => {
      if (/process\.env\s*\[/.test(line) && !line.trim().startsWith("//")) offenders.push(`${path}:${i + 1}`);
    });
  };
  roots.forEach(walk);
  assert.deepEqual(offenders, [], `Usa process.env.NEXT_PUBLIC_NOMBRE de forma literal: ${offenders.join(", ")}`);
});

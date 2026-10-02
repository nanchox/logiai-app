// Sube las imágenes del prototipo (legacy/*.png) al bucket "maps" en las rutas que ya referencia la carga inicial.
// Uso: npx tsx --env-file=.env.local scripts/upload-seed-assets.ts
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env.local");

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

const BASE = "castellana/auditorio-principal";
const files: Record<string, string> = {
  "legacy/mapas.png": `${BASE}/general.png`,
  ...Object.fromEntries([1, 2, 3, 4, 5, 6].map((n) => [`legacy/zona${n}.png`, `${BASE}/zona-${n}.png`])),
};

for (const [local, remote] of Object.entries(files)) {
  const body = await readFile(new URL(`../${local}`, import.meta.url));
  const { error } = await supabase.storage.from("maps").upload(remote, body, { contentType: "image/png", upsert: true });
  if (error) throw new Error(`${remote}: ${error.message}`);
  console.log(`✓ ${remote}`);
}

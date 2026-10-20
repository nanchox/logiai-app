// Capacidad, guías de conteo y totales. Los permisos y las reglas (capacidad, plazo) los aplica la base de datos.
import type { SupabaseClient } from "@supabase/supabase-js";
import { explain } from "@/lib/manual/mutations";
import { prepareMap } from "@/lib/image";

type PgError = { code?: string; message: string } | null;

export async function saveCapacity(sb: SupabaseClient, locationId: string, capacity: number | null) {
  if (capacity !== null && (!Number.isInteger(capacity) || capacity < 0 || capacity > 100000)) throw new Error("La capacidad debe ser un número entero entre 0 y 100000.");
  const { data, error } = await sb.from("locations").update({ capacity }).eq("id", locationId).select("id");
  if (error) throw explain(error);
  if (!data?.length) throw new Error("No tienes permiso para cambiar esta ubicación.");
}

/** Sube (o reemplaza) la guía de conteo de una sede y un día de la semana. */
export async function uploadGuide(sb: SupabaseClient, site: { id: string; slug: string }, day: string, file: File, note: string, previousPath?: string) {
  const img = await prepareMap(file);
  const path = `${site.slug}/${day}/${crypto.randomUUID()}.${img.ext}`;
  const up = await sb.storage.from("counts").upload(path, img.bytes, { contentType: img.contentType });
  if (up.error) throw explain(up.error, "No se pudo subir la imagen.");
  const { error } = await sb.from("count_guides").upsert({ site_id: site.id, day, image_path: path, note: note.trim() || null, updated_at: new Date().toISOString() }, { onConflict: "site_id,day" });
  if (error) {
    await sb.storage.from("counts").remove([path]);
    throw explain(error);
  }
  if (previousPath) await sb.storage.from("counts").remove([previousPath]);
}

export async function saveGuideNote(sb: SupabaseClient, siteId: string, day: string, note: string) {
  const { error } = await sb.from("count_guides").update({ note: note.trim() || null }).eq("site_id", siteId).eq("day", day);
  if (error) throw explain(error);
}

export async function deleteGuide(sb: SupabaseClient, siteId: string, day: string, path: string) {
  const { error } = await sb.from("count_guides").delete().eq("site_id", siteId).eq("day", day);
  if (error) throw explain(error);
  await sb.storage.from("counts").remove([path]);
}

/** Guarda los totales de un servicio (todo o nada). Un total vacío borra el de esa ubicación. */
export async function saveServiceCounts(sb: SupabaseClient, eventId: string, values: { locationId: string; total: number | null }[]) {
  const payload = values.map((v) => ({ location_id: v.locationId, total: v.total }));
  const { error } = (await sb.rpc("save_counts", { p_event: eventId, p_counts: payload })) as { error: PgError };
  if (error) throw explain(error);
}

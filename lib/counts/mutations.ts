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

const validSeats = (n: number | null) => n === null || (Number.isInteger(n) && n >= 0 && n <= 10000);

/** Predeterminado de puestos reservados de una zona en un día de la semana. Vacío (null) lo quita. */
export async function saveReservationDefault(sb: SupabaseClient, zoneId: string, day: string, seats: number | null) {
  if (!validSeats(seats)) throw new Error("Los puestos reservados deben ser un número entero entre 0 y 10000.");
  if (seats === null) {
    const { error } = await sb.from("zone_reservation_defaults").delete().eq("zone_id", zoneId).eq("day", day);
    if (error) throw explain(error);
    return;
  }
  const { error } = await sb.from("zone_reservation_defaults").upsert({ zone_id: zoneId, day, seats, updated_at: new Date().toISOString() }, { onConflict: "zone_id,day" });
  if (error) throw explain(error);
}

/** Ajusta las reservas de un servicio (todo o nada). Vacío (null) vuelve al predeterminado del día. */
export async function saveServiceReservations(sb: SupabaseClient, eventId: string, items: { zoneId: string; seats: number | null }[]) {
  if (items.some((i) => !validSeats(i.seats))) throw new Error("Los puestos reservados deben ser un número entero entre 0 y 10000.");
  const { error } = (await sb.rpc("save_reservations", { p_event: eventId, p_items: items.map((i) => ({ zone_id: i.zoneId, seats: i.seats })) })) as { error: PgError };
  if (error) throw explain(error);
}

// ───────────── Entradas ─────────────
export async function createEntrance(sb: SupabaseClient, locationId: string, name: string, note: string) {
  if (!name.trim()) throw new Error("Escribe el nombre de la entrada.");
  if (name.trim().length > 60) throw new Error("El nombre de la entrada es demasiado largo (máximo 60 caracteres).");
  if (note.trim().length > 200) throw new Error("La nota es demasiado larga (máximo 200 caracteres).");
  const { error } = await sb.from("entrances").insert({ location_id: locationId, name: name.trim(), note: note.trim() || null });
  if (error) throw explain(error);
}
export async function updateEntrance(sb: SupabaseClient, id: string, name: string, note: string) {
  if (!name.trim()) throw new Error("Escribe el nombre de la entrada.");
  if (note.trim().length > 200) throw new Error("La nota es demasiado larga (máximo 200 caracteres).");
  const { error } = await sb.from("entrances").update({ name: name.trim(), note: note.trim() || null }).eq("id", id);
  if (error) throw explain(error);
}
export async function deleteEntrance(sb: SupabaseClient, id: string) {
  const { error } = await sb.from("entrances").delete().eq("id", id);
  if (error) throw explain(error);
}

const validQuota = (n: number | null) => n === null || (Number.isInteger(n) && n >= 0 && n <= 100000);

/** Cupo estándar de una entrada en una reunión del horario. Vacío (null) lo quita. */
export async function saveStandardQuota(sb: SupabaseClient, entranceId: string, meetingId: string, quota: number | null) {
  if (!validQuota(quota)) throw new Error("El cupo debe ser un número entero entre 0 y 100000.");
  if (quota === null) {
    const { error } = await sb.from("entrance_quotas").delete().eq("entrance_id", entranceId).eq("meeting_id", meetingId);
    if (error) throw explain(error);
    return;
  }
  const { error } = await sb.from("entrance_quotas").upsert({ entrance_id: entranceId, meeting_id: meetingId, quota }, { onConflict: "entrance_id,meeting_id" });
  if (error) throw explain(error);
}

/** Ajusta los cupos de un servicio (todo o nada). Vacío (null) vuelve al estándar. */
export async function saveEventQuotas(sb: SupabaseClient, eventId: string, items: { entranceId: string; meetingId: string; quota: number | null }[]) {
  if (items.some((i) => !validQuota(i.quota))) throw new Error("El cupo debe ser un número entero entre 0 y 100000.");
  const { error } = (await sb.rpc("save_event_quotas", { p_event: eventId, p_items: items.map((i) => ({ entrance_id: i.entranceId, meeting_id: i.meetingId, quota: i.quota })) })) as { error: PgError };
  if (error) throw explain(error);
}

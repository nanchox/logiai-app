// Operaciones de edición del manual. Se ejecutan en el navegador con la sesión del usuario:
// los permisos los decide la base de datos (RLS), la interfaz solo oculta lo que no se puede usar.
import type { SupabaseClient } from "@supabase/supabase-js";
import { preparePhoto, prepareMap } from "@/lib/image";
import { parseYouTubeId } from "@/lib/youtube";
import type { PositionKind, Variant, ViewerMedia } from "./types";

type PgError = { code?: string; message: string } | null;

/** Convierte un error de Supabase en un mensaje comprensible. */
export function explain(error: PgError | Error, fallback = "No se pudo completar la acción."): Error {
  const e = error as { code?: string; message?: string; statusCode?: string | number } | null;
  if (!e) return new Error(fallback);
  if (e.code === "23505") return new Error("Ya existe un elemento con ese nombre o código.");
  if (e.code === "42501" || /row-level security|Unauthorized|403/i.test(e.message ?? "") || String(e.statusCode) === "403")
    return new Error("No tienes permiso para hacer esto.");
  if (e.code === "23514") return new Error(e.message?.includes("misma sede") ? e.message : "Algún dato no es válido.");
  return new Error(e.message || fallback);
}
const must = <T>(r: { data: T; error: PgError }): T => {
  if (r.error) throw explain(r.error);
  return r.data;
};

const clamp = (n: number) => Math.min(100, Math.max(0, Math.round(n * 100) / 100));

// ───────────── Pines ─────────────
export type PinChange = { positionId: string; mapId: string; variant: Variant; top: number; left: number };
export type PinRef = { positionId: string; mapId: string; variant: Variant };

export async function savePins(sb: SupabaseClient, upserts: PinChange[], removals: PinRef[]) {
  if (upserts.length) {
    must(await sb.from("position_markers").upsert(
      upserts.map((p) => ({ position_id: p.positionId, map_id: p.mapId, variant: p.variant, top_pct: clamp(p.top), left_pct: clamp(p.left) })),
      { onConflict: "position_id,map_id,variant" },
    ));
  }
  for (const r of removals) {
    must(await sb.from("position_markers").delete().eq("position_id", r.positionId).eq("map_id", r.mapId).eq("variant", r.variant));
  }
}

export async function removePinFromMap(sb: SupabaseClient, positionId: string, mapId: string) {
  must(await sb.from("position_markers").delete().eq("position_id", positionId).eq("map_id", mapId));
}

// ───────────── Posiciones ─────────────
export type PositionInput = {
  code: string; name: string; kind: PositionKind; zoneId: string | null; description: string;
  usesRadio: boolean; days: string[]; shifts: string[]; isActive: boolean;
};

export async function savePosition(sb: SupabaseClient, locationId: string, input: PositionInput, id?: string): Promise<string> {
  const row = {
    code: input.code.trim(), name: input.name.trim(), kind: input.kind, zone_id: input.zoneId, description: input.description.trim(),
    uses_radio: input.usesRadio, days: input.days, shifts: input.shifts, is_active: input.isActive,
  };
  if (!row.code || !row.name) throw new Error("El código y el nombre son obligatorios.");
  if (id) {
    must(await sb.from("positions").update(row).eq("id", id));
    return id;
  }
  const sort = Number.parseInt(row.code, 10);
  const r = must(await sb.from("positions").insert({ ...row, location_id: locationId, sort: Number.isNaN(sort) ? 0 : sort }).select("id").single());
  return (r as { id: string }).id;
}

export async function deletePosition(sb: SupabaseClient, id: string) {
  const photos = must(await sb.from("position_media").select("storage_path").eq("position_id", id).eq("kind", "foto"));
  const paths = (photos as { storage_path: string }[]).map((p) => p.storage_path);
  if (paths.length) await sb.storage.from("position-media").remove(paths);
  must(await sb.from("positions").delete().eq("id", id));
}

// ───────────── Fotos, videos y enlaces ─────────────
export async function addPhoto(sb: SupabaseClient, siteSlug: string, positionId: string, file: File, caption?: string) {
  const img = await preparePhoto(file);
  const path = `${siteSlug}/${positionId}/${crypto.randomUUID()}.${img.ext}`;
  const up = await sb.storage.from("position-media").upload(path, img.bytes, { contentType: img.contentType });
  if (up.error) throw explain(up.error, "No se pudo subir la foto.");
  const ins = await sb.from("position_media").insert({ position_id: positionId, kind: "foto", storage_path: path, caption: caption?.trim() || null });
  if (ins.error) {
    await sb.storage.from("position-media").remove([path]);
    throw explain(ins.error);
  }
}

export async function addLinkMedia(sb: SupabaseClient, positionId: string, kind: "youtube" | "link", rawUrl: string, caption?: string) {
  const url = rawUrl.trim();
  if (kind === "youtube" && !parseYouTubeId(url)) throw new Error("Pega un enlace válido de YouTube (youtube.com o youtu.be).");
  if (kind === "link" && !/^https:\/\/\S+$/i.test(url)) throw new Error("El enlace debe empezar con https://");
  must(await sb.from("position_media").insert({ position_id: positionId, kind, url, caption: caption?.trim() || null }));
}

export async function deleteMedia(sb: SupabaseClient, media: ViewerMedia) {
  must(await sb.from("position_media").delete().eq("id", media.id));
  if (media.path) await sb.storage.from("position-media").remove([media.path]);
}

// ───────────── Mapas y zonas ─────────────
async function uploadMapImage(sb: SupabaseClient, siteSlug: string, locationId: string, mapId: string, version: number, file: File) {
  const img = await prepareMap(file);
  const path = `${siteSlug}/${locationId}/${mapId}-v${version}.${img.ext}`;
  const up = await sb.storage.from("maps").upload(path, img.bytes, { contentType: img.contentType });
  if (up.error) throw explain(up.error, "No se pudo subir la imagen del mapa.");
  return path;
}

/** Crea el mapa de una zona (o el general si zoneId es null) con su imagen. */
export async function createMap(sb: SupabaseClient, siteSlug: string, locationId: string, name: string, zoneId: string | null, file: File, sort = 0) {
  const id = crypto.randomUUID();
  const path = await uploadMapImage(sb, siteSlug, locationId, id, 1, file);
  const ins = await sb.from("maps").insert({ id, location_id: locationId, zone_id: zoneId, name: name.trim(), image_path: path, sort });
  if (ins.error) {
    await sb.storage.from("maps").remove([path]);
    throw explain(ins.error);
  }
  return id;
}

export async function createZoneWithMap(sb: SupabaseClient, siteSlug: string, locationId: string, name: string, kind: string, file: File, sort: number) {
  const z = must(await sb.from("zones").insert({ location_id: locationId, name: name.trim(), kind, sort }).select("id").single()) as { id: string };
  try {
    await createMap(sb, siteSlug, locationId, name, z.id, file, sort);
  } catch (e) {
    await sb.from("zones").delete().eq("id", z.id);
    throw e;
  }
}

/** Reemplaza la imagen de un mapa: sube una versión nueva (ruta distinta) y borra la anterior. */
export async function replaceMapImage(sb: SupabaseClient, siteSlug: string, locationId: string, map: { id: string; version: number; imagePath: string }, file: File) {
  const version = map.version + 1;
  const path = await uploadMapImage(sb, siteSlug, locationId, map.id, version, file);
  const upd = await sb.from("maps").update({ image_path: path, image_version: version }).eq("id", map.id);
  if (upd.error) {
    await sb.storage.from("maps").remove([path]);
    throw explain(upd.error);
  }
  await sb.storage.from("maps").remove([map.imagePath]);
}

export async function renameMap(sb: SupabaseClient, map: { id: string; zoneId: string | null }, name: string) {
  must(await sb.from("maps").update({ name: name.trim() }).eq("id", map.id));
  if (map.zoneId) must(await sb.from("zones").update({ name: name.trim() }).eq("id", map.zoneId));
}

/** Elimina un mapa; si es el de una zona, elimina la zona (sus posiciones quedan sin zona). */
export async function deleteMap(sb: SupabaseClient, map: { id: string; zoneId: string | null; imagePath: string }) {
  if (map.zoneId) must(await sb.from("zones").delete().eq("id", map.zoneId));
  else must(await sb.from("maps").delete().eq("id", map.id));
  await sb.storage.from("maps").remove([map.imagePath]);
}

// ───────────── Espacios (auditorios, salones…) ─────────────
export type LocationInput = { name: string; kind: string; manualUrl: string };
export async function saveLocation(sb: SupabaseClient, siteId: string, input: LocationInput, id?: string, sort = 0) {
  const manual = input.manualUrl.trim();
  if (manual && !/^https:\/\/\S+$/i.test(manual)) throw new Error("El enlace del manual debe empezar con https://");
  const row = { name: input.name.trim(), kind: input.kind, manual_url: manual || null };
  if (!row.name) throw new Error("El nombre es obligatorio.");
  if (id) must(await sb.from("locations").update(row).eq("id", id));
  else must(await sb.from("locations").insert({ ...row, site_id: siteId, sort }));
}

export async function deleteLocation(sb: SupabaseClient, id: string) {
  // Se borran también los archivos de sus mapas y fotos.
  const maps = must(await sb.from("maps").select("image_path").eq("location_id", id)) as { image_path: string }[];
  const photos = must(await sb.from("position_media").select("storage_path, positions!inner(location_id)").eq("positions.location_id", id).eq("kind", "foto")) as { storage_path: string }[];
  must(await sb.from("locations").delete().eq("id", id));
  if (maps.length) await sb.storage.from("maps").remove(maps.map((m) => m.image_path));
  if (photos.length) await sb.storage.from("position-media").remove(photos.map((p) => p.storage_path));
}

// ───────────── Flujos ─────────────
export type StepInput = { id?: string; locationId: string | null; title: string; instructions: string };

export async function saveFlow(sb: SupabaseClient, siteId: string, input: { name: string; description: string }, id?: string, sort = 0) {
  const row = { name: input.name.trim(), description: input.description.trim() };
  if (!row.name) throw new Error("El nombre del flujo es obligatorio.");
  if (id) {
    must(await sb.from("flows").update(row).eq("id", id));
    return id;
  }
  return (must(await sb.from("flows").insert({ ...row, site_id: siteId, sort }).select("id").single()) as { id: string }).id;
}

export async function deleteFlow(sb: SupabaseClient, id: string) {
  must(await sb.from("flows").delete().eq("id", id));
}

/** Reemplaza los pasos de un flujo con el orden recibido (la restricción única es diferible). */
export async function saveSteps(sb: SupabaseClient, flowId: string, steps: StepInput[]) {
  const rows = steps.map((s, i) => ({
    ...(s.id ? { id: s.id } : {}),
    flow_id: flowId, step_order: i + 1, location_id: s.locationId, title: s.title.trim(), instructions: s.instructions.trim(),
  }));
  if (rows.some((r) => !r.title)) throw new Error("Cada paso necesita un título.");
  const keep = rows.filter((r) => "id" in r).map((r) => (r as { id: string }).id);
  const existing = must(await sb.from("flow_steps").select("id").eq("flow_id", flowId)) as { id: string }[];
  const drop = existing.map((e) => e.id).filter((id) => !keep.includes(id));
  if (drop.length) must(await sb.from("flow_steps").delete().in("id", drop));
  // Se separan en dos peticiones porque PostgREST exige las mismas columnas en todo el lote.
  const withId = rows.filter((r) => "id" in r);
  const without = rows.filter((r) => !("id" in r));
  if (withId.length) must(await sb.from("flow_steps").upsert(withId));
  if (without.length) must(await sb.from("flow_steps").insert(without));
}

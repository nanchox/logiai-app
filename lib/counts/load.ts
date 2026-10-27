import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays } from "@/lib/service/dates";
import { loadEvents } from "@/lib/service/load";
import type { ServiceEvent } from "@/lib/service/types";
import type { CountGuide, CountLocation, CountLogEntry, CountRow } from "./types";

/** Ubicaciones visibles (de las sedes que la persona ve) con su capacidad. */
export async function loadCountLocations(supabase: SupabaseClient, siteId?: string): Promise<CountLocation[]> {
  let q = supabase.from("locations").select("id, site_id, name, kind, capacity, sort");
  if (siteId) q = q.eq("site_id", siteId);
  const { data } = await q.order("sort").order("name");
  return (data ?? []).map((l) => ({ id: l.id, siteId: l.site_id, name: l.name, kind: l.kind, capacity: l.capacity, sort: l.sort }));
}

/** Guías de conteo que la persona puede ver, con enlace firmado de la imagen. */
export async function loadGuides(supabase: SupabaseClient, siteId?: string): Promise<CountGuide[]> {
  let q = supabase.from("count_guides").select("site_id, day, image_path, note, updated_at");
  if (siteId) q = q.eq("site_id", siteId);
  const { data } = await q;
  const rows = data ?? [];
  const signed = rows.length ? await supabase.storage.from("counts").createSignedUrls(rows.map((g) => g.image_path), 3600) : { data: [] };
  const urlByPath = new Map((signed.data ?? []).map((s) => [s.path, s.signedUrl]));
  return rows.map((g) => ({ siteId: g.site_id, day: g.day, path: g.image_path, url: urlByPath.get(g.image_path) ?? null, note: g.note, updatedAt: g.updated_at }));
}

/** Totales de los servicios dados (solo llegan los que la persona puede ver). */
export async function loadCounts(supabase: SupabaseClient, eventIds: string[]): Promise<CountRow[]> {
  if (!eventIds.length) return [];
  const { data } = await supabase.from("service_counts").select("event_id, location_id, total").in("event_id", eventIds);
  return (data ?? []).map((c) => ({ eventId: c.event_id, locationId: c.location_id, total: c.total }));
}

export async function loadCountLog(supabase: SupabaseClient, eventId: string): Promise<CountLogEntry[]> {
  const { data } = await supabase.rpc("count_log", { p_event: eventId });
  return ((data ?? []) as Record<string, unknown>[]).map((l) => ({
    changedAt: l.changed_at as string, name: (l.full_name as string | null) ?? null, locationName: l.location_name as string,
    oldTotal: (l.old_total as number | null) ?? null, newTotal: (l.new_total as number | null) ?? null,
  }));
}

/** Servicios y totales de una semana (lunes a domingo), con los de la semana anterior para compararlos. */
export async function loadWeek(supabase: SupabaseClient, monday: string): Promise<{ events: ServiceEvent[]; counts: CountRow[]; prevEvents: ServiceEvent[]; prevCounts: CountRow[] }> {
  const [events, prevEvents] = await Promise.all([
    loadEvents(supabase, { from: monday, until: addDays(monday, 6), limit: 400 }),
    loadEvents(supabase, { from: addDays(monday, -7), until: addDays(monday, -1), limit: 400 }),
  ]);
  const [counts, prevCounts] = await Promise.all([loadCounts(supabase, events.map((e) => e.id)), loadCounts(supabase, prevEvents.map((e) => e.id))]);
  return { events, counts, prevEvents, prevCounts };
}

/** Servicios recientes de un grupo a los que todavía les faltan los conteos (para el recordatorio). */
export async function loadPendingCounts(supabase: SupabaseClient, groupId: string, today: string): Promise<ServiceEvent[]> {
  const recent = (await loadEvents(supabase, { from: addDays(today, -1), until: today, groupId, limit: 10 })).filter((e) => e.status === "programado");
  if (!recent.length) return [];
  const counts = await loadCounts(supabase, recent.map((e) => e.id));
  const done = new Set(counts.map((c) => c.eventId));
  // Sin ubicaciones con capacidad en la sede no hay nada que contar.
  const locs = await loadCountLocations(supabase);
  const hasCapacity = new Set(locs.filter((l) => l.capacity !== null).map((l) => l.siteId));
  return recent.filter((e) => !done.has(e.id) && hasCapacity.has(e.siteId));
}

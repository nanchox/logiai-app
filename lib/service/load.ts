import type { SupabaseClient } from "@supabase/supabase-js";
import type { Cancellation, EventKind, EventStatus, HistoryItem, PlanData, PlanPosition, RotationGroup, ServiceEvent } from "./types";

type EventRow = {
  id: string; slot_id: string; service_date: string; group_id: string | null; kind: EventKind; manual: boolean;
  status: EventStatus; cancel_reason: string | null; note: string | null;
  service_slots: { site_id: string; day: string; shift: string; sites: { name: string; slug: string } };
  groups: { name: string } | null;
};
const EVENT_SELECT = "id, slot_id, service_date, group_id, kind, manual, status, cancel_reason, note, service_slots(site_id, day, shift, sites(name, slug)), groups(name)";

const toEvent = (r: EventRow): ServiceEvent => ({
  id: r.id, slotId: r.slot_id, siteId: r.service_slots.site_id, siteName: r.service_slots.sites.name, siteSlug: r.service_slots.sites.slug,
  day: r.service_slots.day, shift: r.service_slots.shift, date: r.service_date, groupId: r.group_id, groupName: r.groups?.name ?? null,
  kind: r.kind, manual: r.manual, status: r.status, cancelReason: r.cancel_reason, note: r.note,
});

/** Servicios que el usuario puede ver (lo decide RLS), de más cercano a más lejano. */
export async function loadEvents(
  supabase: SupabaseClient,
  o: { from?: string; until?: string; siteId?: string; groupId?: string; slotId?: string; limit?: number; descending?: boolean } = {},
): Promise<ServiceEvent[]> {
  let q = supabase.from("service_events").select(EVENT_SELECT);
  if (o.from) q = q.gte("service_date", o.from);
  if (o.until) q = q.lte("service_date", o.until);
  if (o.groupId) q = q.eq("group_id", o.groupId);
  if (o.slotId) q = q.eq("slot_id", o.slotId);
  const { data } = await q.order("service_date", { ascending: !o.descending }).limit(o.limit ?? 200);
  const events = ((data ?? []) as unknown as EventRow[]).map(toEvent);
  return o.siteId ? events.filter((e) => e.siteId === o.siteId) : events;
}

export async function loadEvent(supabase: SupabaseClient, id: string): Promise<ServiceEvent | null> {
  const { data } = await supabase.from("service_events").select(EVENT_SELECT).eq("id", id).maybeSingle();
  return data ? toEvent(data as unknown as EventRow) : null;
}

/** Grupos de cada horario con su puesto en la rotación. */
export async function loadRotationGroups(supabase: SupabaseClient): Promise<RotationGroup[]> {
  const { data } = await supabase.from("groups").select("id, name, service_slot_id, rotation_order").order("rotation_order").order("name");
  return (data ?? []).map((g) => ({ id: g.id, name: g.name, slotId: g.service_slot_id, order: g.rotation_order }));
}

type CancelRow = {
  id: string; service_date: string; site_id: string | null; slot_id: string | null; reason: string | null;
  sites: { name: string } | null; service_slots: { day: string; shift: string } | null;
};
export async function loadCancellations(supabase: SupabaseClient, from: string): Promise<Cancellation[]> {
  const { data } = await supabase
    .from("service_cancellations")
    .select("id, service_date, site_id, slot_id, reason, sites(name), service_slots(day, shift)")
    .gte("service_date", from)
    .order("service_date");
  return ((data ?? []) as unknown as CancelRow[]).map((c) => ({
    id: c.id, date: c.service_date, siteId: c.site_id, siteName: c.sites?.name ?? null, slotId: c.slot_id,
    day: c.service_slots?.day ?? null, shift: c.service_slots?.shift ?? null, reason: c.reason,
  }));
}

/** Posiciones de la sede que aplican a ese día y franja y están activas, en el orden del manual. */
export async function loadPlanPositions(supabase: SupabaseClient, siteId: string, day: string, shift: string): Promise<PlanPosition[]> {
  const { data } = await supabase
    .from("positions")
    .select("id, code, name, kind, uses_radio, days, shifts, sort, is_active, locations!inner(name, site_id, sort)")
    .eq("locations.site_id", siteId)
    .eq("is_active", true);
  type Row = { id: string; code: string; name: string; kind: "supervisor" | "voluntario"; uses_radio: boolean; days: string[]; shifts: string[]; sort: number; locations: { name: string; sort: number } };
  return ((data ?? []) as unknown as Row[])
    .filter((p) => (!p.days.length || p.days.includes(day)) && (!p.shifts.length || p.shifts.includes(shift)))
    .sort((a, b) => a.locations.sort - b.locations.sort || a.locations.name.localeCompare(b.locations.name, "es") || a.sort - b.sort || a.code.localeCompare(b.code, "es", { numeric: true }))
    .map((p) => ({ id: p.id, code: p.code, name: p.name, kind: p.kind, locationName: p.locations.name, usesRadio: p.uses_radio, sort: p.sort }));
}

/** Planeación de un servicio: lo que la persona puede ver según RLS (el borrador solo llega a quienes planifican). */
export async function loadPlan(supabase: SupabaseClient, eventId: string): Promise<PlanData> {
  const [plan, assignments, notes, files] = await Promise.all([
    supabase.from("service_plans").select("status").eq("event_id", eventId).maybeSingle(),
    supabase.from("service_assignments").select("id, position_id, user_id").eq("event_id", eventId),
    supabase.from("service_position_notes").select("position_id, note").eq("event_id", eventId),
    supabase.from("schedule_files").select("id, file_name, mime_type, size_bytes, storage_path").eq("event_id", eventId).order("created_at"),
  ]);
  const fileRows = files.data ?? [];
  const signed = fileRows.length ? await supabase.storage.from("schedules").createSignedUrls(fileRows.map((f) => f.storage_path), 3600) : { data: [] };
  const urlByPath = new Map((signed.data ?? []).map((s) => [s.path, s.signedUrl]));
  return {
    status: (plan.data?.status as PlanData["status"]) ?? null,
    assignments: (assignments.data ?? []).map((a) => ({ id: a.id, positionId: a.position_id, userId: a.user_id })),
    notes: Object.fromEntries((notes.data ?? []).map((n) => [n.position_id, n.note])),
    files: fileRows.map((f) => ({ id: f.id, name: f.file_name, mime: f.mime_type, size: f.size_bytes, path: f.storage_path, url: urlByPath.get(f.storage_path) ?? null })),
  };
}

/** Historial de posiciones de una persona (solo servicios con planeación publicada que puede ver). */
export async function loadHistory(supabase: SupabaseClient, userId: string, limit = 40): Promise<HistoryItem[]> {
  const { data } = await supabase
    .from("service_assignments")
    .select("event_id, positions(name, code), service_events!inner(service_date, group_id, groups(name), service_slots(day, shift, sites(name)))")
    .eq("user_id", userId);
  type Row = {
    event_id: string; positions: { name: string; code: string };
    service_events: { service_date: string; group_id: string | null; groups: { name: string } | null; service_slots: { day: string; shift: string; sites: { name: string } } };
  };
  return ((data ?? []) as unknown as Row[])
    .map((r) => ({
      eventId: r.event_id, date: r.service_events.service_date, siteName: r.service_events.service_slots.sites.name,
      day: r.service_events.service_slots.day, shift: r.service_events.service_slots.shift, groupId: r.service_events.group_id, groupName: r.service_events.groups?.name ?? null,
      positionName: r.positions.name, positionCode: r.positions.code,
    }))
    .sort((a, b) => b.date.localeCompare(a.date) || a.positionCode.localeCompare(b.positionCode, "es", { numeric: true }))
    .slice(0, limit);
}

/** Última fecha de rotación ya generada de cada horario (para seguir generando desde ahí). */
export async function loadLastRotationDates(supabase: SupabaseClient): Promise<Record<string, string>> {
  const { data } = await supabase.from("service_events").select("slot_id, service_date").eq("kind", "rotacion").order("service_date", { ascending: false }).limit(2000);
  const last: Record<string, string> = {};
  for (const r of data ?? []) if (!(r.slot_id in last)) last[r.slot_id] = r.service_date;
  return last;
}

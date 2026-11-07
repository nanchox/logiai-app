import type { SupabaseClient } from "@supabase/supabase-js";
import type { CounterEntrance, CounterState } from "./types";

/** Entradas que la persona puede contar hoy (en su posición de conteo, o todas las de la sede si planifica el servicio). */
export async function loadMyCounterEntrances(supabase: SupabaseClient): Promise<CounterEntrance[]> {
  const { data } = await supabase.rpc("my_counter_entrances");
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    eventId: r.event_id as string, date: r.service_date as string, siteName: r.site_name as string, groupName: (r.group_name as string | null) ?? null,
    entranceId: r.entrance_id as string, entranceName: r.entrance_name as string, note: (r.entrance_note as string | null) ?? null,
    locationName: r.location_name as string, assigned: !!r.assigned,
  }));
}

export async function loadCounterState(supabase: SupabaseClient, eventId: string, entranceId: string): Promise<CounterState | null> {
  const { data, error } = await supabase.rpc("entrance_counter_state", { p_event: eventId, p_entrance: entranceId });
  const rows = (data ?? []) as Record<string, unknown>[];
  if (error || !rows.length) return null;
  return {
    entranceName: rows[0].entrance_name as string, note: (rows[0].entrance_note as string | null) ?? null, zones: (rows[0].entrance_zones as string | null) ?? null, locationName: rows[0].location_name as string,
    capacity: (rows[0].location_capacity as number | null) ?? null,
    meetings: rows.map((r) => ({
      meetingId: r.meeting_id as string, time: r.meeting_time ? String(r.meeting_time).slice(0, 5) : null, label: (r.meeting_label as string | null) ?? null,
      quota: (r.quota as number | null) ?? null, count: Number(r.count ?? 0), locationTotal: Number(r.location_total ?? 0),
    })),
  };
}

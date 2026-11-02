import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays } from "@/lib/service/dates";
import { MAX_RESERVATION_DAYS, type ReserverMeeting, type ReserverZone, type SeatReservation } from "./types";

/** Zonas en las que la persona puede reservar. Quien solo reserva no ve el manual: las zonas llegan por una función. */
export async function loadReserverZones(supabase: SupabaseClient): Promise<ReserverZone[]> {
  const { data } = await supabase.rpc("reserver_zones");
  return ((data ?? []) as Record<string, string>[]).map((r) => ({ siteId: r.site_id, siteName: r.site_name, zoneId: r.zone_id, zoneName: r.zone_name, locationName: r.location_name }));
}

/** Reservas que la persona puede ver entre dos fechas: las suyas y, si coordina, supervisa o administra la sede, las de esa sede. */
export async function loadSeatReservations(supabase: SupabaseClient, from: string, until = addDays(from, MAX_RESERVATION_DAYS)): Promise<SeatReservation[]> {
  const { data } = await supabase.rpc("seat_reservations_for", { p_from: from, p_until: until });
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: r.id as string, siteId: r.site_id as string, siteName: r.site_name as string, zoneId: r.zone_id as string, zoneName: r.zone_name as string,
    locationId: r.location_id as string, locationName: r.location_name as string,
    date: r.service_date as string, meetingTime: r.meeting_time ? String(r.meeting_time).slice(0, 5) : null, row: r.row_label as string, seats: r.seats as number, forWhom: r.for_whom as string,
    byName: (r.created_by_name as string | null) ?? null, mine: r.mine as boolean,
  }));
}

/** Reuniones estándar (por sede y día) de las sedes donde la persona reserva. */
export async function loadReserverMeetings(supabase: SupabaseClient): Promise<ReserverMeeting[]> {
  const { data } = await supabase.rpc("reserver_meetings");
  return ((data ?? []) as Record<string, string | null>[]).map((r) => ({ siteId: r.site_id as string, day: r.day as string, time: String(r.start_time).slice(0, 5), label: r.label }));
}

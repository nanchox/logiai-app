import type { SupabaseClient } from "@supabase/supabase-js";
import { explain } from "@/lib/manual/mutations";

type PgError = { code?: string; message: string } | null;

export type ReservationInput = { zoneId: string; date: string; row: string; seats: number; forWhom: string; /** «HH:MM»; vacío = todas las reuniones */ meeting?: string };

/** Registra una reserva de puestos. Los permisos y los límites los aplica la base de datos. */
export async function createReservation(sb: SupabaseClient, i: ReservationInput) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(i.date)) throw new Error("Elige la fecha.");
  if (!i.zoneId) throw new Error("Elige la zona.");
  if (!i.row.trim()) throw new Error("Escribe la fila.");
  if (!Number.isInteger(i.seats) || i.seats < 1 || i.seats > 10000) throw new Error("Los puestos deben ser un número entero de 1 a 10000.");
  if (!i.forWhom.trim()) throw new Error("Escribe para quién es la reserva.");
  const { error } = (await sb.rpc("create_seat_reservation", { p_zone: i.zoneId, p_date: i.date, p_row: i.row.trim(), p_seats: i.seats, p_for: i.forWhom.trim(), p_meeting: i.meeting || null })) as { error: PgError };
  if (error) throw explain(error);
}

export async function deleteReservation(sb: SupabaseClient, id: string) {
  const { error } = await sb.from("seat_reservations").delete().eq("id", id);
  if (error) throw explain(error);
}

/** Edita una reserva (líder de su sede, cabeza y administrador). Los permisos y los límites los aplica la base de datos. */
export async function updateReservation(sb: SupabaseClient, id: string, i: ReservationInput) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(i.date)) throw new Error("Elige la fecha.");
  if (!i.zoneId) throw new Error("Elige la zona.");
  if (!i.row.trim()) throw new Error("Escribe la fila.");
  if (!Number.isInteger(i.seats) || i.seats < 1 || i.seats > 10000) throw new Error("Los puestos deben ser un número entero de 1 a 10000.");
  if (!i.forWhom.trim()) throw new Error("Escribe para quién es la reserva.");
  const { error } = (await sb.rpc("update_seat_reservation", { p_id: id, p_zone: i.zoneId, p_date: i.date, p_row: i.row.trim(), p_seats: i.seats, p_for: i.forWhom.trim(), p_meeting: i.meeting || null })) as { error: PgError };
  if (error) throw explain(error);
}

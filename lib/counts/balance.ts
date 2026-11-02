// Cuadre del aforo de una ubicación en una reunión: cupos de las entradas + reservas = aforo. Funciones puras: sin base de datos.
import type { Meeting } from "@/lib/service/meetings";
import { quotaTotal } from "./quotas";
import type { EntranceQuota, EventQuota, ReservationDefault, ReservationOverride } from "./types";

export type BalanceStatus = "cuadra" | "faltan" | "sobran" | "sin-aforo";
export type Balance = {
  capacity: number | null;
  quotas: number;          // suma de los cupos de las entradas
  zoneReserved: number;    // reservas de zona (predeterminadas y ajustes del servicio)
  roleReserved: number;    // reservas registradas por quien tiene el rol «Reservas»
  total: number;           // cupos + reservas
  diff: number;            // aforo − total (positivo = faltan por asignar; negativo = sobran)
  status: BalanceStatus;
};

type RoleReservation = { zoneId: string; meetingTime: string | null; seats: number };

/** Puestos reservados en una zona para una reunión: ajuste de esa reunión; si no, el del servicio para todas; si no, el predeterminado de la reunión; si no, el del día. */
export function zoneReservedSeats(zoneId: string, meeting: Pick<Meeting, "id" | "baseId">, day: string, defaults: ReservationDefault[], overrides: ReservationOverride[]): number {
  const ov = overrides.filter((o) => o.zoneId === zoneId);
  const specific = ov.find((o) => o.meetingId === meeting.id);
  if (specific) return specific.seats;
  const general = ov.find((o) => o.meetingId === null);
  if (general) return general.seats;
  const df = defaults.filter((d) => d.zoneId === zoneId && d.day === day);
  return (df.find((d) => d.meetingId === (meeting.baseId ?? meeting.id)) ?? df.find((d) => d.meetingId === null))?.seats ?? 0;
}

export function balanceOf(o: {
  capacity: number | null; entranceIds: string[]; zoneIds: string[]; meeting: Pick<Meeting, "id" | "baseId" | "time">; day: string;
  standardQuotas: EntranceQuota[]; eventQuotas: EventQuota[]; defaults: ReservationDefault[]; overrides: ReservationOverride[]; roleReservations: RoleReservation[];
}): Balance {
  const quotas = quotaTotal(o.entranceIds, o.meeting, o.standardQuotas, o.eventQuotas);
  const zoneReserved = o.zoneIds.reduce((s, z) => s + zoneReservedSeats(z, o.meeting, o.day, o.defaults, o.overrides), 0);
  const roleReserved = o.roleReservations.filter((r) => o.zoneIds.includes(r.zoneId) && (r.meetingTime === null || r.meetingTime.slice(0, 5) === o.meeting.time)).reduce((s, r) => s + r.seats, 0);
  const total = quotas + zoneReserved + roleReserved;
  if (o.capacity === null) return { capacity: null, quotas, zoneReserved, roleReserved, total, diff: 0, status: "sin-aforo" };
  const diff = o.capacity - total;
  return { capacity: o.capacity, quotas, zoneReserved, roleReserved, total, diff, status: diff === 0 ? "cuadra" : diff > 0 ? "faltan" : "sobran" };
}

export const balanceMessage = (b: Balance): string =>
  b.status === "cuadra" ? "Cuadra con el aforo"
  : b.status === "faltan" ? `Faltan ${b.diff} por asignar`
  : b.status === "sobran" ? `Sobran ${-b.diff}: se pasa del aforo`
  : "Sin aforo registrado";

import { formatServiceDateShort } from "@/lib/service/dates";
import { formatMeetingTime } from "@/lib/service/meetings";
import type { SeatReservation } from "@/lib/reservations/types";

/** Reservas de puestos para tener en cuenta durante el servicio: zona, fila, cuántos puestos y para quién. */
export function ReservationList({ items, showDate = false, showSite = false, ariaLabel = "Reservas de puestos" }: { items: SeatReservation[]; showDate?: boolean; showSite?: boolean; ariaLabel?: string }) {
  if (!items.length) return <p className="text-sm text-muted">No hay reservas de puestos registradas.</p>;
  return (
    <ul aria-label={ariaLabel} className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-bg">
      {items.map((r) => (
        <li key={r.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-3 py-2 text-sm">
          {showDate && <span className="font-semibold">{formatServiceDateShort(r.date)}</span>}
          {showSite && <span className="text-xs font-bold uppercase tracking-wider text-muted">{r.siteName}</span>}
          <span className="font-semibold">{r.zoneName}</span>
          <span className="text-muted">{r.locationName} · fila {r.row}</span>
          <span className="rounded-full border border-line px-2 py-0.5 text-xs font-semibold">{r.meetingTime ? `Reunión ${formatMeetingTime(r.meetingTime)}` : "Todas las reuniones"}</span>
          <span className="rounded-full bg-badge px-2 py-0.5 text-xs font-bold text-on-badge">{r.seats} {r.seats === 1 ? "puesto" : "puestos"}</span>
          <span className="min-w-0 flex-1 basis-40">Para: <strong>{r.forWhom}</strong></span>
        </li>
      ))}
    </ul>
  );
}

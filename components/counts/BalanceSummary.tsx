import { balanceMessage, balanceOf, type Balance } from "@/lib/counts/balance";
import type { CountLocation, Entrance, EntranceQuota, EventQuota, ReservationDefault, ReservationOverride, ReservationZone } from "@/lib/counts/types";
import { formatMeetingTime, type Meeting } from "@/lib/service/meetings";

const STYLE: Record<Balance["status"], string> = {
  cuadra: "border-primary/60 bg-primary/10",
  faltan: "border-info bg-info/10",
  sobran: "border-danger/60 bg-danger/10 text-danger",
  "sin-aforo": "border-line bg-bg text-muted",
};
const MARK: Record<Balance["status"], string> = { cuadra: "✓", faltan: "…", sobran: "!", "sin-aforo": "—" };

/**
 * Cuadre del aforo por reunión: cupos de las entradas + reservas de zona + reservas del rol «Reservas» frente al aforo de la ubicación.
 * Solo avisa: nunca impide guardar.
 */
export function BalanceSummary({
  locations, entrances, zones, meetings, day, standardQuotas, eventQuotas, defaults, overrides, roleReservations, title = "Cuadre del aforo",
}: {
  locations: CountLocation[]; entrances: Entrance[]; zones: ReservationZone[]; meetings: Meeting[]; day: string;
  standardQuotas: EntranceQuota[]; eventQuotas: EventQuota[]; defaults: ReservationDefault[]; overrides: ReservationOverride[];
  roleReservations: { zoneId: string; meetingTime: string | null; seats: number }[]; title?: string;
}) {
  const shown = locations.filter((l) => entrances.some((e) => e.locationId === l.id));
  if (!shown.length || !meetings.length) return null;
  return (
    <section aria-label={title} className="space-y-3">
      <div>
        <h3 className="text-base font-extrabold">{title}</h3>
        <p className="text-sm text-muted">Cupos de las entradas + reservas deben sumar el aforo de cada lugar en cada reunión. Solo es un aviso.</p>
      </div>
      {shown.map((l) => {
        const entranceIds = entrances.filter((e) => e.locationId === l.id).map((e) => e.id);
        const zoneIds = zones.filter((z) => z.locationId === l.id).map((z) => z.id);
        return (
          <div key={l.id} className="overflow-x-auto rounded-lg border border-line" role="group" aria-label={`Cuadre de ${l.name}`}>
            <table className="w-full min-w-[34rem] text-left text-sm">
              <thead className="bg-bg"><tr><th className="p-2">{l.name} <span className="font-normal text-muted">· aforo {l.capacity ?? "sin registrar"}</span></th><th className="p-2">Cupos</th><th className="p-2">Reservas de zona</th><th className="p-2">Reservas del rol</th><th className="p-2">Total</th></tr></thead>
              <tbody className="divide-y divide-line">
                {meetings.map((m) => {
                  const b = balanceOf({ capacity: l.capacity, entranceIds, zoneIds, meeting: m, day, standardQuotas, eventQuotas, defaults, overrides, roleReservations });
                  return (
                    <tr key={m.id} aria-label={`${l.name} a las ${formatMeetingTime(m.time)}: ${balanceMessage(b)}`}>
                      <th scope="row" className="p-2 font-semibold">{formatMeetingTime(m.time)}{m.label ? ` · ${m.label}` : ""}</th>
                      <td className="p-2">{b.quotas}</td>
                      <td className="p-2">{b.zoneReserved}</td>
                      <td className="p-2">{b.roleReserved}</td>
                      <td className="p-2"><span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-bold ${STYLE[b.status]}`}><span aria-hidden>{MARK[b.status]}</span>{b.total} · {balanceMessage(b)}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}
    </section>
  );
}

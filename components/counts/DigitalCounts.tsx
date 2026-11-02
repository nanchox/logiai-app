import { effectiveQuota } from "@/lib/counts/quotas";
import type { CountLocation, Entrance, EntranceCounterRow, EntranceQuota, EventQuota } from "@/lib/counts/types";
import { formatMeetingTime, type Meeting } from "@/lib/service/meetings";

/** Conteo digital de las entradas por reunión: lo que van contando con el contador (cuántos de cuántos) y el total de cada lugar. Solo lectura. */
export function DigitalCounts({ locations, entrances, meetings, counters, standard, overrides }: {
  locations: CountLocation[]; entrances: Entrance[]; meetings: Meeting[]; counters: EntranceCounterRow[]; standard: EntranceQuota[]; overrides: EventQuota[];
}) {
  const shown = locations.filter((l) => entrances.some((e) => e.locationId === l.id));
  if (!shown.length || !counters.length || !meetings.length) return null;
  const countOf = (entranceId: string, meetingId: string) => counters.find((c) => c.entranceId === entranceId && c.meetingId === meetingId)?.count ?? 0;
  return (
    <section aria-label="Conteo digital de las entradas" className="space-y-3">
      <div>
        <h3 className="text-base font-extrabold">Conteo digital de las entradas</h3>
        <p className="text-sm text-muted">Lo que cuentan los servidores con el contador, por entrada y reunión. El total de cada lugar pasa solo a los totales del servicio.</p>
      </div>
      {shown.map((l) => {
        const ents = entrances.filter((e) => e.locationId === l.id);
        return (
          <div key={l.id} className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full min-w-[26rem] text-left text-sm" aria-label={`Conteo digital de ${l.name}`}>
              <thead className="bg-bg"><tr><th className="p-2">{l.name}</th>{meetings.map((m) => <th key={m.id} className="p-2">{formatMeetingTime(m.time)}{m.label ? ` · ${m.label}` : ""}</th>)}</tr></thead>
              <tbody className="divide-y divide-line">
                {ents.map((e) => (
                  <tr key={e.id}>
                    <th scope="row" className="p-2 font-semibold">{e.name}</th>
                    {meetings.map((m) => {
                      const q = effectiveQuota(e.id, m, standard, overrides).quota;
                      return <td key={m.id} className="p-2">{countOf(e.id, m.id)}{q !== null && <span className="text-muted"> de {q}</span>}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-bg"><tr><th scope="row" className="p-2">Total del lugar{l.capacity !== null && <span className="font-normal text-muted"> · aforo {l.capacity}</span>}</th>{meetings.map((m) => <td key={m.id} className="p-2 font-bold">{ents.reduce((s, e) => s + countOf(e.id, m.id), 0)}</td>)}</tr></tfoot>
            </table>
          </div>
        );
      })}
    </section>
  );
}

"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { btnPrimary, ErrorText, input } from "@/components/manual/ui";
import { saveEventQuotas } from "@/lib/counts/mutations";
import { effectiveQuota } from "@/lib/counts/quotas";
import type { CountLocation, Entrance, EntranceQuota, EventQuota } from "@/lib/counts/types";
import { formatMeetingTime, type Meeting } from "@/lib/service/meetings";
import { createClient } from "@/lib/supabase/client";

/** Cupos de las entradas de este servicio por reunión: parten del estándar y se pueden ajustar solo para este día. */
export function EventQuotas({ eventId, locations, entrances, meetings, standard, overrides, canEdit }: {
  eventId: string; locations: CountLocation[]; entrances: Entrance[]; meetings: Meeting[]; standard: EntranceQuota[]; overrides: EventQuota[]; canEdit: boolean;
}) {
  const sb = useMemo(() => createClient(), []);
  const router = useRouter();
  const key = (e: string, m: string) => `${e}:${m}`;
  const initial = useMemo(() => Object.fromEntries(overrides.map((o) => [key(o.entranceId, o.meetingId), String(o.quota)])), [overrides]);
  const [vals, setVals] = useState<Record<string, string>>(initial);
  const [base, setBase] = useState<Record<string, string>>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const withEntrances = locations.filter((l) => entrances.some((e) => e.locationId === l.id));
  if (!withEntrances.length || !meetings.length) return null;
  const cells = entrances.flatMap((e) => meetings.map((m) => ({ e, m, k: key(e.id, m.id) })));
  const parsed = (k: string) => { const v = (vals[k] ?? "").trim(); return v === "" ? null : Number(v); };
  const bad = (k: string) => { const n = parsed(k); return n !== null && (!Number.isInteger(n) || n < 0 || n > 100000); };
  const changed = cells.filter((c) => (vals[c.k] ?? "") !== (base[c.k] ?? ""));

  async function save(ev: React.FormEvent) {
    ev.preventDefault();
    setBusy(true); setError(null); setSaved(false);
    try {
      await saveEventQuotas(sb, eventId, changed.map((c) => ({ entranceId: c.e.id, meetingId: c.m.id, quota: parsed(c.k) })));
      setBase({ ...vals }); setSaved(true); router.refresh();
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }

  return (
    <form className="space-y-3" aria-label="Cupos de las entradas" onSubmit={save}>
      <div>
        <h3 className="text-base font-extrabold">Cupos de las entradas por reunión</h3>
        <p className="text-sm text-muted">Cuántas personas se esperan por cada entrada. Si hoy cambian, escribe el número de este servicio; vacío = el estándar.</p>
      </div>
      {withEntrances.map((l) => (
        <div key={l.id} className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full min-w-[26rem] text-left text-sm" aria-label={`Cupos de ${l.name}`}>
            <thead className="bg-bg"><tr><th className="p-2">{l.name}</th>{meetings.map((m) => <th key={m.id} className="p-2">{formatMeetingTime(m.time)}{m.label ? ` · ${m.label}` : ""}</th>)}</tr></thead>
            <tbody className="divide-y divide-line">
              {entrances.filter((e) => e.locationId === l.id).map((e) => (
                <tr key={e.id}>
                  <th scope="row" className="p-2 font-semibold">{e.name}{e.note && <span className="block text-xs font-normal text-muted">{e.note}</span>}</th>
                  {meetings.map((m) => {
                    const k = key(e.id, m.id);
                    const eff = effectiveQuota(e.id, m, standard, overrides);
                    const typed = parsed(k);
                    const isAdjusted = typed !== null ? typed !== eff.standard : eff.adjusted;
                    return (
                      <td key={m.id} className="p-2">
                        <input type="number" inputMode="numeric" min={0} max={100000} className={`${input} ${bad(k) ? "!border-danger" : ""}`} aria-label={`Cupo de ${e.name} a las ${formatMeetingTime(m.time)}`}
                          value={vals[k] ?? ""} disabled={!canEdit || busy} aria-invalid={bad(k)} placeholder={eff.standard !== null ? `Estándar ${eff.standard}` : "Sin cupo"}
                          onChange={(ev) => { setVals({ ...vals, [k]: ev.target.value }); setSaved(false); }} />
                        {isAdjusted && <span className="text-xs font-bold">Ajustado</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      <ErrorText error={error} />
      {saved && <p role="status" className="rounded-lg border border-primary/50 bg-primary/10 p-2 text-sm">Cupos guardados.</p>}
      {canEdit && <button type="submit" className={btnPrimary} disabled={busy || changed.length === 0 || changed.some((c) => bad(c.k))}>Guardar cupos</button>}
    </form>
  );
}

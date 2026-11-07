"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { btnPrimary, ErrorText, input } from "@/components/manual/ui";
import { effectiveQuota } from "@/lib/counts/quotas";
import { saveEntranceCounts } from "@/lib/counts/mutations";
import type { CountLocation, Entrance, EntranceCounterRow, EntranceQuota, EventQuota } from "@/lib/counts/types";
import { formatMeetingTime, type Meeting } from "@/lib/service/meetings";
import { createClient } from "@/lib/supabase/client";

const ZERO = "00000000-0000-0000-0000-000000000000";

/** Conteo por entrada y reunión: se escribe a mano (tope = cupo de la entrada) o lo lleva el contador digital. El total de cada lugar pasa solo a los totales del servicio. */
export function EntranceCountsForm({ eventId, locations, entrances, meetings, counters, standard, overrides, canEdit }: {
  eventId: string; locations: CountLocation[]; entrances: Entrance[]; meetings: Meeting[]; counters: EntranceCounterRow[]; standard: EntranceQuota[]; overrides: EventQuota[]; canEdit: boolean;
}) {
  const sb = useMemo(() => createClient(), []);
  const router = useRouter();
  const cols: Meeting[] = meetings.length ? meetings : [{ id: ZERO, baseId: null, time: "", label: null }];
  const key = (e: string, m: string) => `${e}|${m}`;
  const initial = useMemo(() => Object.fromEntries(counters.map((c) => [key(c.entranceId, c.meetingId), String(c.count)])), [counters]);
  const [vals, setVals] = useState<Record<string, string>>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const shown = locations.filter((l) => entrances.some((e) => e.locationId === l.id));
  if (!shown.length) return null;

  const val = (e: string, m: string) => (vals[key(e, m)] ?? "").trim();
  const quotaOf = (e: Entrance, m: Meeting) => (m.id === ZERO ? standard.find((q) => q.entranceId === e.id)?.quota ?? null : effectiveQuota(e.id, m, standard, overrides).quota);
  const bad = (e: Entrance, m: Meeting) => {
    const v = val(e.id, m.id);
    if (v === "") return false;
    const n = Number(v), q = quotaOf(e, m);
    return !Number.isInteger(n) || n < 0 || n > 100000 || (q !== null && n > q);
  };
  const changed = entrances.flatMap((e) => cols.filter((m) => (vals[key(e.id, m.id)] ?? "") !== (initial[key(e.id, m.id)] ?? "")).map((m) => ({ e, m })));
  const anyBad = changed.some(({ e, m }) => bad(e, m));
  const totalOf = (l: CountLocation, m: Meeting) => entrances.filter((e) => e.locationId === l.id).reduce((s, e) => s + (Number(val(e.id, m.id)) || 0), 0);

  async function save(ev: React.FormEvent) {
    ev.preventDefault();
    setBusy(true); setError(null); setSaved(false);
    try {
      await saveEntranceCounts(sb, eventId, changed.map(({ e, m }) => ({ entranceId: e.id, meetingId: m.id, count: val(e.id, m.id) === "" ? null : Number(val(e.id, m.id)) })));
      setSaved(true);
      router.refresh();
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }

  return (
    <form onSubmit={save} aria-label="Conteo por entrada" className="space-y-3">
      <div>
        <h3 className="text-base font-extrabold">Conteo por entrada</h3>
        <p className="text-sm text-muted">Cuántas personas ingresaron por cada entrada en cada reunión (no puede superar su cupo). También lo lleva el contador digital; el total de cada lugar pasa solo a los totales del servicio.</p>
      </div>
      {shown.map((l) => {
        const ents = entrances.filter((e) => e.locationId === l.id);
        return (
          <div key={l.id} className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full min-w-[26rem] text-left text-sm" aria-label={`Conteo por entrada de ${l.name}`}>
              <thead className="bg-bg"><tr><th className="p-2">{l.name}</th>{cols.map((m) => <th key={m.id} className="p-2">{m.id === ZERO ? "Servicio" : `${formatMeetingTime(m.time)}${m.label ? ` · ${m.label}` : ""}`}</th>)}</tr></thead>
              <tbody className="divide-y divide-line">
                {ents.map((e) => (
                  <tr key={e.id}>
                    <th scope="row" className="p-2 font-semibold">{e.name}{e.zonesText && <span className="block text-xs font-normal text-muted">Zonas: {e.zonesText}</span>}</th>
                    {cols.map((m) => {
                      const q = quotaOf(e, m);
                      return (
                        <td key={m.id} className="p-2">
                          <div className="flex items-center gap-1">
                            <input type="number" inputMode="numeric" min={0} max={q ?? 100000} className={`${input} w-20`} aria-label={`${e.name} ${m.id === ZERO ? "" : formatMeetingTime(m.time)} conteo`.replace("  ", " ")}
                              aria-invalid={bad(e, m) || undefined} disabled={!canEdit} value={vals[key(e.id, m.id)] ?? ""} onChange={(ev) => setVals({ ...vals, [key(e.id, m.id)]: ev.target.value })} />
                            {q !== null && <span className="text-muted">de {q}</span>}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-bg"><tr><th scope="row" className="p-2">Total del lugar{l.capacity !== null && <span className="font-normal text-muted"> · aforo {l.capacity}</span>}</th>{cols.map((m) => <td key={m.id} className="p-2 font-bold">{totalOf(l, m)}</td>)}</tr></tfoot>
            </table>
          </div>
        );
      })}
      <ErrorText error={error} />
      {canEdit && (
        <div className="flex items-center gap-3">
          <button className={btnPrimary} disabled={busy || !changed.length || anyBad}>{busy ? "Guardando…" : "Guardar conteo por entrada"}</button>
          {anyBad && <span role="alert" className="text-sm text-danger">Hay un conteo mayor al cupo de su entrada.</span>}
          {saved && <span role="status" className="text-sm text-muted">Guardado.</span>}
        </div>
      )}
    </form>
  );
}

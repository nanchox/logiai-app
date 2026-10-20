"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { btnPrimary, ErrorText, input } from "@/components/manual/ui";
import { formatDateTime } from "@/lib/announcements/dates";
import { DAY_LABEL } from "@/lib/labels";
import { addDays, formatServiceDate } from "@/lib/service/dates";
import type { CountGuide, CountLocation, CountLogEntry, CountRow } from "@/lib/counts/types";
import { type CountWindow } from "@/lib/counts/window";
import { saveServiceCounts } from "@/lib/counts/mutations";
import { createClient } from "@/lib/supabase/client";

const pct = (n: number, cap: number) => (cap > 0 ? Math.round((n / cap) * 1000) / 10 : 0);

/** Guía de conteo (imagen) y captura del total final por ubicación de un servicio. */
export function CountPanel({
  eventId, date, day, locations, counts, guide, canCount, window: win, manager, canSeeCounts, log,
}: {
  eventId: string; date: string; day: string; locations: CountLocation[]; counts: CountRow[]; guide: CountGuide | null;
  canCount: boolean; window: CountWindow; manager: boolean; canSeeCounts: boolean; log: CountLogEntry[];
}) {
  const sb = useMemo(() => createClient(), []);
  const router = useRouter();
  const withCapacity = locations.filter((l) => l.capacity !== null);
  const initial = useMemo(() => Object.fromEntries(counts.map((c) => [c.locationId, String(c.total)])), [counts]);
  const [vals, setVals] = useState<Record<string, string>>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const parsed = (id: string) => { const v = (vals[id] ?? "").trim(); return v === "" ? null : Number(v); };
  const invalid = (l: CountLocation) => { const n = parsed(l.id); return n !== null && (!Number.isInteger(n) || n < 0 || n > (l.capacity ?? 0)); };
  const dirty = withCapacity.some((l) => (vals[l.id] ?? "") !== (initial[l.id] ?? ""));
  const anyInvalid = withCapacity.some(invalid);
  const counted = withCapacity.filter((l) => parsed(l.id) !== null && !invalid(l));
  const total = counted.reduce((s, l) => s + (parsed(l.id) ?? 0), 0);
  const capacity = counted.reduce((s, l) => s + (l.capacity ?? 0), 0);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null); setSaved(false);
    try {
      await saveServiceCounts(sb, eventId, withCapacity.map((l) => ({ locationId: l.id, total: parsed(l.id) })).filter((v) => (vals[v.locationId] ?? "") !== (initial[v.locationId] ?? "")));
      setSaved(true);
      router.refresh();
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }

  const note =
    win === "pronto" ? "Podrás registrar los conteos desde el día del servicio."
    : win === "abierto" ? `Puedes registrar y corregir los conteos hasta el final del ${formatServiceDate(addDays(date, 1)).toLowerCase()}.`
    : manager ? "Ya pasó el plazo del coordinador: tú puedes corregir los conteos."
    : "Ya pasó el plazo de 24 horas: solo el líder de la sede puede corregir los conteos.";

  return (
    <section aria-label="Conteos y totales" className="space-y-4 rounded-2xl border border-line bg-surface p-5">
      <div>
        <h2 className="text-lg font-extrabold">Conteos y totales</h2>
        <p className="text-sm text-muted">Se cuenta en cada entrada como indica la guía; al terminar el servicio se registra cuántas personas entraron en cada ubicación.</p>
      </div>

      {guide?.url ? (
        <figure className="space-y-2">
          <a href={guide.url} target="_blank" rel="noreferrer" aria-label="Abrir la guía de conteo en grande">
            {/* eslint-disable-next-line @next/next/no-img-element -- imagen firmada y privada: next/image no aplica */}
            <img src={guide.url} alt={`Guía de conteo del ${DAY_LABEL[day] ?? day}`} className="max-h-96 w-full rounded-lg border border-line bg-white object-contain" />
          </a>
          <figcaption className="text-sm text-muted">Guía de conteo del {(DAY_LABEL[day] ?? day).toLowerCase()}{guide.note ? `: ${guide.note}` : ""}. Toca la imagen para verla en grande.</figcaption>
        </figure>
      ) : (
        <p className="text-sm text-muted">Todavía no hay una guía de conteo para este día{manager ? <>: cárgala en <Link href="/conteos/configurar">Conteos → Capacidad y guías</Link>.</> : "."}</p>
      )}

      {canSeeCounts && (
        withCapacity.length === 0 ? (
          <p className="rounded-lg border border-line p-3 text-sm text-muted">
            Las ubicaciones de esta sede todavía no tienen capacidad registrada{manager ? <>: regístrala en <Link href="/conteos/configurar">Capacidad y guías</Link>.</> : ": pide a tu líder de sede que la registre."}
          </p>
        ) : (
          <form className="space-y-3" aria-label="Registrar conteos" onSubmit={save}>
            <p className="text-sm">{note}</p>
            <ul className="divide-y divide-line rounded-lg border border-line">
              {withCapacity.map((l) => {
                const n = parsed(l.id);
                return (
                  <li key={l.id} className="grid items-center gap-2 px-3 py-2 sm:grid-cols-[1fr_9rem_6rem]">
                    <label htmlFor={`cnt-${l.id}`} className="font-semibold">{l.name} <span className="text-sm font-normal text-muted">· capacidad {l.capacity}</span></label>
                    <input id={`cnt-${l.id}`} type="number" inputMode="numeric" min={0} max={l.capacity ?? undefined} step={1} className={`${input} ${invalid(l) ? "!border-danger" : ""}`}
                      value={vals[l.id] ?? ""} disabled={!canCount || busy} aria-invalid={invalid(l)} onChange={(e) => { setVals({ ...vals, [l.id]: e.target.value }); setSaved(false); }} placeholder="Sin contar" />
                    <span className={`text-sm ${invalid(l) ? "font-bold text-danger" : "text-muted"}`} aria-live="polite">
                      {invalid(l) ? `Máx. ${l.capacity}` : n !== null ? `${pct(n, l.capacity ?? 0)} %` : ""}
                    </span>
                  </li>
                );
              })}
            </ul>
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm">Total contado: <strong>{total}</strong>{counted.length > 0 && <> · ocupación {pct(total, capacity)} %</>}</p>
              {canCount && <button type="submit" className={`${btnPrimary} ml-auto`} disabled={busy || !dirty || anyInvalid}>Guardar conteos</button>}
            </div>
            <ErrorText error={error} />
            {saved && <p role="status" className="rounded-lg border border-primary/50 bg-primary/10 p-2 text-sm">Conteos guardados.</p>}
          </form>
        )
      )}

      {manager && log.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer font-semibold text-link">Historial de cambios ({log.length})</summary>
          <ul className="mt-2 space-y-1">
            {log.map((l, i) => (
              <li key={i} className="text-muted">
                {formatDateTime(l.changedAt)} · <strong className="text-fg">{l.name ?? "Persona eliminada"}</strong> · {l.locationName}: {l.oldTotal ?? "—"} → {l.newTotal ?? "borrado"}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

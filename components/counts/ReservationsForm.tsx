"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { btnPrimary, ErrorText, input } from "@/components/manual/ui";
import { DAY_LABEL } from "@/lib/labels";
import { saveServiceReservations } from "@/lib/counts/mutations";
import type { ReservationDefault, ReservationOverride, ReservationZone } from "@/lib/counts/types";
import { createClient } from "@/lib/supabase/client";

/**
 * Reservas por zona de un servicio: los puestos reservados en una fila de cada zona. El valor predeterminado es del día de la semana;
 * durante el servicio se puede cambiar (queda como «Ajustado»). Dejar el campo vacío vuelve al predeterminado.
 */
export function ReservationsForm({
  eventId, day, zones, defaults, overrides, canEdit, manager,
}: { eventId: string; day: string; zones: ReservationZone[]; defaults: ReservationDefault[]; overrides: ReservationOverride[]; canEdit: boolean; manager: boolean }) {
  const sb = useMemo(() => createClient(), []);
  const router = useRouter();
  const dayDefault = useMemo(() => new Map(defaults.filter((d) => d.day === day).map((d) => [d.zoneId, d.seats])), [defaults, day]);
  const override = useMemo(() => new Map(overrides.map((o) => [o.zoneId, o.seats])), [overrides]);
  const initial = useMemo(() => Object.fromEntries(zones.map((z) => [z.id, override.has(z.id) ? String(override.get(z.id)) : ""])), [zones, override]);
  const [vals, setVals] = useState<Record<string, string>>(initial);
  const [base, setBase] = useState<Record<string, string>>(initial);   // lo último guardado: lo que se compara para saber qué cambió
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const listed = zones.filter((z) => dayDefault.has(z.id) || override.has(z.id));
  const others = zones.filter((z) => !listed.includes(z));
  const parsed = (id: string) => { const v = (vals[id] ?? "").trim(); return v === "" ? null : Number(v); };
  const invalid = (id: string) => { const n = parsed(id); return n !== null && (!Number.isInteger(n) || n < 0 || n > 10000); };
  const changed = zones.filter((z) => (vals[z.id] ?? "") !== (base[z.id] ?? ""));
  const effective = (id: string) => parsed(id) ?? dayDefault.get(id) ?? 0;
  const totalSeats = zones.reduce((s, z) => s + (invalid(z.id) ? 0 : effective(z.id)), 0);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null); setSaved(false);
    try {
      await saveServiceReservations(sb, eventId, changed.map((z) => ({ zoneId: z.id, seats: parsed(z.id) })));
      setBase({ ...vals });
      setSaved(true);
      router.refresh();
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }

  if (zones.length === 0) return null;

  const row = (z: ReservationZone) => {
    const def = dayDefault.get(z.id);
    const adjusted = override.has(z.id) && override.get(z.id) !== (def ?? 0);
    return (
      <li key={z.id} className="grid items-center gap-2 px-3 py-2 sm:grid-cols-[1fr_9rem_8rem]">
        <label htmlFor={`rsv-${z.id}`} className="font-semibold">{z.name} <span className="text-sm font-normal text-muted">· {z.locationName}</span></label>
        <input id={`rsv-${z.id}`} type="number" inputMode="numeric" min={0} max={10000} step={1} className={`${input} ${invalid(z.id) ? "!border-danger" : ""}`}
          value={vals[z.id] ?? ""} disabled={!canEdit || busy} aria-invalid={invalid(z.id)} placeholder={def !== undefined ? `Predet. ${def}` : "Sin reserva"}
          onChange={(e) => { setVals({ ...vals, [z.id]: e.target.value }); setSaved(false); }} />
        <span className="text-sm text-muted" aria-live="polite">
          {invalid(z.id) ? <strong className="text-danger">0 a 10000</strong> : adjusted || (parsed(z.id) !== null && parsed(z.id) !== (def ?? 0)) ? <strong className="text-fg">Ajustado</strong> : def !== undefined ? `Predeterminado ${def}` : ""}
        </span>
      </li>
    );
  };

  return (
    <form className="space-y-3" aria-label="Reservas por zona" onSubmit={save}>
      <div>
        <h3 className="text-base font-extrabold">Reservas por zona</h3>
        <p className="text-sm text-muted">Puestos reservados en una fila de cada zona el {(DAY_LABEL[day] ?? day).toLowerCase()}. Si hoy cambian, escribe el número de este servicio; vacío = el predeterminado.</p>
      </div>
      {listed.length === 0 ? (
        <p className="rounded-lg border border-line p-3 text-sm text-muted">
          No hay reservas predeterminadas para este día{manager ? <>: defínelas en <Link href="/conteos/configurar">Capacidad y guías</Link>.</> : "."}
        </p>
      ) : <ul className="divide-y divide-line rounded-lg border border-line">{listed.map(row)}</ul>}
      {others.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer font-semibold text-link">Reservar en otra zona ({others.length})</summary>
          <ul className="mt-2 divide-y divide-line rounded-lg border border-line">{others.map(row)}</ul>
        </details>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm">Puestos reservados hoy: <strong>{totalSeats}</strong></p>
        {canEdit && <button type="submit" className={`${btnPrimary} ml-auto`} disabled={busy || changed.length === 0 || changed.some((z) => invalid(z.id))}>Guardar reservas</button>}
      </div>
      <ErrorText error={error} />
      {saved && <p role="status" className="rounded-lg border border-primary/50 bg-primary/10 p-2 text-sm">Reservas guardadas.</p>}
    </form>
  );
}

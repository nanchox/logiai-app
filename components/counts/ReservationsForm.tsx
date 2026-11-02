"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { btnPrimary, ErrorText, input, label } from "@/components/manual/ui";
import { zoneReservedSeats } from "@/lib/counts/balance";
import { DAY_LABEL } from "@/lib/labels";
import { saveServiceReservations } from "@/lib/counts/mutations";
import type { ReservationDefault, ReservationOverride, ReservationZone } from "@/lib/counts/types";
import { formatMeetingTime, type Meeting } from "@/lib/service/meetings";
import { createClient } from "@/lib/supabase/client";

const ALL = "todas";

/**
 * Reservas por zona de un servicio: los puestos reservados en una fila de cada zona, para todas las reuniones del día o para una en particular.
 * El valor predeterminado es del día (y de la reunión); durante el servicio se puede cambiar (queda como «Ajustado»). Vacío vuelve al predeterminado.
 */
export function ReservationsForm({
  eventId, day, zones, defaults, overrides, canEdit, manager, meetings = [],
}: { eventId: string; day: string; zones: ReservationZone[]; defaults: ReservationDefault[]; overrides: ReservationOverride[]; canEdit: boolean; manager: boolean; meetings?: Meeting[] }) {
  const sb = useMemo(() => createClient(), []);
  const router = useRouter();
  const [scope, setScope] = useState<string>(ALL);                       // «todas» o el id de una reunión
  const meeting = meetings.find((m) => m.id === scope) ?? null;
  const key = (zoneId: string, s: string) => `${zoneId}:${s}`;
  const initial = useMemo(() => Object.fromEntries(overrides.map((o) => [key(o.zoneId, o.meetingId ?? ALL), String(o.seats)])), [overrides]);
  const [vals, setVals] = useState<Record<string, string>>(initial);
  const [base, setBase] = useState<Record<string, string>>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Predeterminado de la zona para lo elegido: el de la reunión; si no, el del día.
  const defaultOf = (zoneId: string): number | undefined => {
    const df = defaults.filter((d) => d.zoneId === zoneId && d.day === day);
    return (meeting ? df.find((d) => d.meetingId === (meeting.baseId ?? meeting.id)) : undefined)?.seats ?? df.find((d) => d.meetingId === null)?.seats;
  };
  const hasAny = (zoneId: string) => defaults.some((d) => d.zoneId === zoneId && d.day === day) || overrides.some((o) => o.zoneId === zoneId && (o.meetingId === (meeting?.id ?? null)));
  const listed = zones.filter((z) => hasAny(z.id) || (vals[key(z.id, scope)] ?? "") !== "");
  const others = zones.filter((z) => !listed.includes(z));
  const parsed = (zoneId: string) => { const v = (vals[key(zoneId, scope)] ?? "").trim(); return v === "" ? null : Number(v); };
  const invalid = (zoneId: string) => { const n = parsed(zoneId); return n !== null && (!Number.isInteger(n) || n < 0 || n > 10000); };
  const cells = zones.flatMap((z) => [ALL, ...meetings.map((m) => m.id)].map((s) => ({ z, s, k: key(z.id, s) })));
  const changed = cells.filter((c) => (vals[c.k] ?? "") !== (base[c.k] ?? ""));
  const totalSeats = zones.reduce((sum, z) => {
    if (invalid(z.id)) return sum;
    const typed = parsed(z.id);
    if (typed !== null) return sum + typed;
    return sum + (meeting ? zoneReservedSeats(z.id, meeting, day, defaults, overrides.filter((o) => (vals[key(o.zoneId, o.meetingId ?? ALL)] ?? "") === String(o.seats))) : overrides.find((o) => o.zoneId === z.id && o.meetingId === null)?.seats ?? defaultOf(z.id) ?? 0);
  }, 0);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null); setSaved(false);
    try {
      await saveServiceReservations(sb, eventId, changed.map((c) => { const v = (vals[c.k] ?? "").trim(); return { zoneId: c.z.id, meetingId: c.s === ALL ? null : c.s, seats: v === "" ? null : Number(v) }; }));
      setBase({ ...vals });
      setSaved(true);
      router.refresh();
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }

  if (zones.length === 0) return null;

  const row = (z: ReservationZone) => {
    const def = defaultOf(z.id);
    const typed = parsed(z.id);
    const adjusted = typed !== null && typed !== (def ?? 0);
    return (
      <li key={z.id} className="grid items-center gap-2 px-3 py-2 sm:grid-cols-[1fr_9rem_8rem]">
        <label htmlFor={`rsv-${z.id}`} className="font-semibold">{z.name} <span className="text-sm font-normal text-muted">· {z.locationName}</span></label>
        <input id={`rsv-${z.id}`} type="number" inputMode="numeric" min={0} max={10000} step={1} className={`${input} ${invalid(z.id) ? "!border-danger" : ""}`}
          value={vals[key(z.id, scope)] ?? ""} disabled={!canEdit || busy} aria-invalid={invalid(z.id)} placeholder={def !== undefined ? `Predet. ${def}` : "Sin reserva"}
          onChange={(e) => { setVals({ ...vals, [key(z.id, scope)]: e.target.value }); setSaved(false); }} />
        <span className="text-sm text-muted" aria-live="polite">
          {invalid(z.id) ? <strong className="text-danger">0 a 10000</strong> : adjusted ? <strong className="text-fg">Ajustado</strong> : def !== undefined ? `Predeterminado ${def}` : ""}
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
      {meetings.length > 0 && (
        <div>
          <label className={label} htmlFor="rsv-meeting">Reunión</label>
          <select id="rsv-meeting" className={`${input} w-auto`} value={scope} onChange={(e) => { setScope(e.target.value); setSaved(false); }}>
            <option value={ALL}>Todas las reuniones</option>
            {meetings.map((m) => <option key={m.id} value={m.id}>{formatMeetingTime(m.time)}{m.label ? ` · ${m.label}` : ""}</option>)}
          </select>
        </div>
      )}
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
        <p className="text-sm">Puestos reservados {meeting ? `a las ${formatMeetingTime(meeting.time)}` : "hoy"}: <strong>{totalSeats}</strong></p>
        {canEdit && <button type="submit" className={`${btnPrimary} ml-auto`} disabled={busy || changed.length === 0 || changed.some((c) => { const v = (vals[c.k] ?? "").trim(); return v !== "" && (!Number.isInteger(Number(v)) || Number(v) < 0 || Number(v) > 10000); })}>Guardar reservas</button>}
      </div>
      <ErrorText error={error} />
      {saved && <p role="status" className="rounded-lg border border-primary/50 bg-primary/10 p-2 text-sm">Reservas guardadas.</p>}
    </form>
  );
}

"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { btn, btnDanger, btnPrimary, ErrorText, input, label, ModalDialog } from "@/components/manual/ui";
import { deleteReservation, updateReservation } from "@/lib/reservations/mutations";
import { MAX_RESERVATION_DAYS, type ReserverMeeting, type ReserverZone, type SeatReservation } from "@/lib/reservations/types";
import { addDays, formatServiceDateShort, weekdayKey } from "@/lib/service/dates";
import { formatMeetingTime } from "@/lib/service/meetings";
import { createClient } from "@/lib/supabase/client";

/** Reservas de puestos de las sedes que la persona administra: se pueden revisar, editar y quitar. */
export function ReservationsAdmin({ items, zones, today, meetings = [] }: { items: SeatReservation[]; zones: ReserverZone[]; today: string; meetings?: ReserverMeeting[] }) {
  const sb = useMemo(() => createClient(), []);
  const router = useRouter();
  const [when, setWhen] = useState<"proximas" | "anteriores">("proximas");
  const [site, setSite] = useState("");
  const [editing, setEditing] = useState<SeatReservation | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sites = [...new Map(items.map((r) => [r.siteId, r.siteName])).entries()];
  const shown = items
    .filter((r) => (when === "proximas" ? r.date >= today : r.date < today))
    .filter((r) => !site || r.siteId === site);

  return (
    <section aria-label="Reservas registradas" className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-extrabold">Reservas registradas ({shown.length})</h2>
        <div role="group" aria-label="Fechas" className="ml-auto flex gap-2">
          {(["proximas", "anteriores"] as const).map((w) => (
            <button key={w} type="button" aria-pressed={when === w} className={`rounded-full border px-4 py-2 text-sm font-bold ${when === w ? "border-accent bg-accent text-on-accent" : "border-line bg-surface hover:border-primary"}`} onClick={() => setWhen(w)}>
              {w === "proximas" ? "Próximas" : "Últimos 30 días"}
            </button>
          ))}
        </div>
        {sites.length > 1 && (
          <select aria-label="Sede" className={`${input} w-auto`} value={site} onChange={(e) => setSite(e.target.value)}>
            <option value="">Todas las sedes</option>
            {sites.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        )}
      </div>

      {shown.length === 0 ? <p className="rounded-2xl border border-line bg-surface p-5 text-muted">No hay reservas {when === "proximas" ? "próximas" : "en los últimos 30 días"}.</p> : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
          {shown.map((r) => (
            <li key={r.id} aria-label={`Reserva de ${r.forWhom}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3 text-sm">
              <span className="font-semibold">{formatServiceDateShort(r.date)}</span>
              {sites.length > 1 && <span className="text-xs font-bold uppercase tracking-wider text-muted">{r.siteName}</span>}
              <span>{r.zoneName} <span className="text-muted">· {r.locationName} · fila {r.row}</span></span>
              <span className="rounded-full border border-line px-2 py-0.5 text-xs font-semibold">{r.meetingTime ? `Reunión ${formatMeetingTime(r.meetingTime)}` : "Todas las reuniones"}</span>
              <span className="rounded-full bg-badge px-2 py-0.5 text-xs font-bold text-on-badge">{r.seats} {r.seats === 1 ? "puesto" : "puestos"}</span>
              <span className="min-w-0 flex-1 basis-40">Para: <strong>{r.forWhom}</strong>{r.byName && <span className="text-muted"> · registró {r.byName}</span>}</span>
              <button type="button" className={btn} aria-label={`Editar la reserva de ${r.forWhom}`} onClick={() => { setError(null); setEditing(r); }}>Editar</button>
              <button type="button" className={btnDanger} disabled={busy} aria-label={`Quitar la reserva de ${r.forWhom}`}
                onClick={async () => {
                  if (!window.confirm(`¿Quitar la reserva de ${r.forWhom}?`)) return;
                  setBusy(true); setError(null);
                  try { await deleteReservation(sb, r.id); router.refresh(); } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
                }}>Quitar</button>
            </li>
          ))}
        </ul>
      )}
      <ErrorText error={error} />

      <ModalDialog open={editing !== null} onClose={() => setEditing(null)} size="lg" title="Editar reserva">
        {editing && <EditForm key={editing.id} r={editing} zones={zones.filter((z) => z.siteId === editing.siteId)} meetings={meetings.filter((m) => m.siteId === editing.siteId)} today={today} onClose={() => setEditing(null)} />}
      </ModalDialog>
    </section>
  );
}

function EditForm({ r, zones, meetings, today, onClose }: { r: SeatReservation; zones: ReserverZone[]; meetings: ReserverMeeting[]; today: string; onClose: () => void }) {
  const sb = useMemo(() => createClient(), []);
  const router = useRouter();
  const initialZone = zones.find((z) => z.zoneName === r.zoneName && z.locationName === r.locationName)?.zoneId ?? zones[0]?.zoneId ?? "";
  const [zoneId, setZoneId] = useState(initialZone);
  const [date, setDate] = useState(r.date);
  const [row, setRow] = useState(r.row);
  const [seats, setSeats] = useState(String(r.seats));
  const [forWhom, setForWhom] = useState(r.forWhom);
  const [meeting, setMeeting] = useState(r.meetingTime ?? "");
  // Reuniones estándar del día de la semana de la fecha (más la actual de la reserva, aunque ya no esté en la lista)
  const meetingOptions: { time: string; label: string | null }[] = meetings.filter((m) => m.day === weekdayKey(date)).map((m) => ({ time: m.time, label: m.label }));
  if (r.meetingTime && !meetingOptions.some((m) => m.time === r.meetingTime)) meetingOptions.push({ time: r.meetingTime, label: null });
  meetingOptions.sort((a, b) => a.time.localeCompare(b.time));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const groups = [...zones.reduce((m, z) => m.set(z.locationName, [...(m.get(z.locationName) ?? []), z]), new Map<string, ReserverZone[]>()).entries()];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await updateReservation(sb, r.id, { zoneId, date, row, seats: Number(seats), forWhom, meeting });
      router.refresh();
      onClose();
    } catch (err) { setError((err as Error).message); setBusy(false); }
  }

  return (
    <div className="flex max-h-[90vh] flex-col">
      <form onSubmit={submit} aria-label="Editar reserva" className="space-y-4 overflow-y-auto p-6">
        <h2 className="text-xl font-extrabold text-link">Editar reserva · {r.siteName}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={label} htmlFor="er-date">Fecha</label>
            <input id="er-date" type="date" className={input} value={date} min={r.date < today ? r.date : today} max={addDays(today, MAX_RESERVATION_DAYS)} required onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label className={label} htmlFor="er-zone">Zona</label>
            <select id="er-zone" className={input} value={zoneId} onChange={(e) => setZoneId(e.target.value)}>
              {groups.map(([loc, list]) => <optgroup key={loc} label={loc}>{list.map((z) => <option key={z.zoneId} value={z.zoneId}>{z.zoneName}</option>)}</optgroup>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className={label} htmlFor="er-meeting">Reunión</label>
            <select id="er-meeting" className={input} value={meeting} onChange={(e) => setMeeting(e.target.value)}>
              <option value="">Todas las reuniones del día</option>
              {meetingOptions.map((m) => <option key={m.time} value={m.time}>{formatMeetingTime(m.time)}{m.label ? ` · ${m.label}` : ""}</option>)}
            </select>
          </div>
          <div>
            <label className={label} htmlFor="er-row">Fila</label>
            <input id="er-row" className={input} value={row} maxLength={20} required onChange={(e) => setRow(e.target.value)} />
          </div>
          <div>
            <label className={label} htmlFor="er-seats">Número de puestos</label>
            <input id="er-seats" type="number" inputMode="numeric" min={1} max={10000} step={1} className={input} value={seats} required onChange={(e) => setSeats(e.target.value)} />
          </div>
        </div>
        <div>
          <label className={label} htmlFor="er-for">Para quién es la reserva</label>
          <input id="er-for" className={input} value={forWhom} maxLength={120} required onChange={(e) => setForWhom(e.target.value)} />
        </div>
        <ErrorText error={error} />
        <button className={btnPrimary} disabled={busy}>{busy ? "Guardando…" : "Guardar cambios"}</button>
      </form>
      <button type="button" onClick={onClose} className="shrink-0 bg-deep p-4 font-bold text-white">CERRAR</button>
    </div>
  );
}

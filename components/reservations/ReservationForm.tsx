"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { btnDanger, btnPrimary, ErrorText, input, label } from "@/components/manual/ui";
import { createReservation, deleteReservation } from "@/lib/reservations/mutations";
import type { ReserverZone, SeatReservation } from "@/lib/reservations/types";
import { MAX_RESERVATION_DAYS, type ReserverMeeting } from "@/lib/reservations/types";
import { addDays, formatServiceDateShort, weekdayKey } from "@/lib/service/dates";
import { formatMeetingTime } from "@/lib/service/meetings";
import { createClient } from "@/lib/supabase/client";

/** El cuadro de reservas: fecha, zona, fila, número de puestos y para quién. Debajo, las reservas que esa persona ha registrado. */
export function ReservationForm({ zones, mine, today, meetings = [] }: { zones: ReserverZone[]; mine: SeatReservation[]; today: string; meetings?: ReserverMeeting[] }) {
  const sb = useMemo(() => createClient(), []);
  const router = useRouter();
  const [date, setDate] = useState(today);
  const [zoneId, setZoneId] = useState(zones[0]?.zoneId ?? "");
  const [meeting, setMeeting] = useState("");                  // «» = todas las reuniones del día
  const [row, setRow] = useState("");
  const [seats, setSeats] = useState("");
  const [forWhom, setForWhom] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const groups = useMemo(() => {
    const m = new Map<string, ReserverZone[]>();
    for (const z of zones) { const k = `${z.siteName} · ${z.locationName}`; m.set(k, [...(m.get(k) ?? []), z]); }
    return [...m.entries()];
  }, [zones]);
  const sites = new Set(zones.map((z) => z.siteId)).size;
  // Reuniones estándar de la sede de la zona elegida en el día de la semana de la fecha
  const siteId = zones.find((z) => z.zoneId === zoneId)?.siteId;
  const dayMeetings = date ? meetings.filter((m) => m.siteId === siteId && m.day === weekdayKey(date)) : [];
  const chosenMeeting = dayMeetings.some((m) => m.time === meeting) ? meeting : "";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null); setDone(null);
    try {
      await createReservation(sb, { zoneId, date, row, seats: Number(seats), forWhom, meeting: chosenMeeting });
      const z = zones.find((x) => x.zoneId === zoneId);
      setDone(`Reserva guardada: ${seats} ${Number(seats) === 1 ? "puesto" : "puestos"} en ${z?.zoneName ?? "la zona"}, fila ${row.trim()}, para ${forWhom.trim()}${chosenMeeting ? ` (reunión de las ${formatMeetingTime(chosenMeeting)})` : ""}.`);
      setRow(""); setSeats(""); setForWhom("");
      router.refresh();
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }

  if (!zones.length) {
    return <p className="rounded-2xl border border-line bg-surface p-5 text-muted">Todavía no hay zonas en tu sede para reservar. Pide a tu líder de sede que las cree en el manual.</p>;
  }

  return (
    <section aria-label="Reservas de puestos" className="space-y-4">
      <form onSubmit={submit} aria-label="Registrar reserva" className="space-y-4 rounded-2xl border border-line bg-surface p-5">
        <div>
          <h2 className="text-lg font-extrabold">Reservar puestos</h2>
          <p className="text-sm text-muted">Los coordinadores y supervisores de la sede la verán durante su servicio.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={label} htmlFor="rv-date">Fecha</label>
            <input id="rv-date" type="date" className={input} value={date} min={today} max={addDays(today, MAX_RESERVATION_DAYS)} required onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label className={label} htmlFor="rv-zone">Zona</label>
            <select id="rv-zone" className={input} value={zoneId} onChange={(e) => setZoneId(e.target.value)}>
              {groups.map(([g, list]) => (
                <optgroup key={g} label={sites > 1 ? g : list[0].locationName}>
                  {list.map((z) => <option key={z.zoneId} value={z.zoneId}>{z.zoneName}</option>)}
                </optgroup>
              ))}
            </select>
          </div>
          {dayMeetings.length > 0 && (
            <div className="sm:col-span-2">
              <label className={label} htmlFor="rv-meeting">Reunión</label>
              <select id="rv-meeting" className={input} value={chosenMeeting} onChange={(e) => setMeeting(e.target.value)}>
                <option value="">Todas las reuniones del día</option>
                {dayMeetings.map((m) => <option key={m.time} value={m.time}>{formatMeetingTime(m.time)}{m.label ? ` · ${m.label}` : ""}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className={label} htmlFor="rv-row">Fila</label>
            <input id="rv-row" className={input} value={row} maxLength={20} required onChange={(e) => setRow(e.target.value)} placeholder="Ej.: 5 o D" />
          </div>
          <div>
            <label className={label} htmlFor="rv-seats">Número de puestos</label>
            <input id="rv-seats" type="number" inputMode="numeric" min={1} max={10000} step={1} className={input} value={seats} required onChange={(e) => setSeats(e.target.value)} />
          </div>
        </div>
        <div>
          <label className={label} htmlFor="rv-for">Para quién es la reserva</label>
          <input id="rv-for" className={input} value={forWhom} maxLength={120} required onChange={(e) => setForWhom(e.target.value)} placeholder="Ej.: Familia Pérez, invitados del pastor" />
        </div>
        <ErrorText error={error} />
        {done && <p role="status" className="rounded-lg border border-primary/50 bg-primary/10 p-2 text-sm">{done}</p>}
        <button className={btnPrimary} disabled={busy}>{busy ? "Guardando…" : "Guardar reserva"}</button>
      </form>

      <div className="space-y-2">
        <h3 className="text-base font-extrabold">Mis reservas próximas</h3>
        {mine.length === 0 ? <p className="text-sm text-muted">Todavía no has registrado reservas.</p> : (
          <ul aria-label="Mis reservas" className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {mine.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3 text-sm">
                <span className="font-semibold">{formatServiceDateShort(r.date)}</span>
                <span>{r.zoneName} · fila {r.row}{r.meetingTime ? ` · ${formatMeetingTime(r.meetingTime)}` : ""}</span>
                <span className="rounded-full bg-badge px-2 py-0.5 text-xs font-bold text-on-badge">{r.seats} {r.seats === 1 ? "puesto" : "puestos"}</span>
                <span className="min-w-0 flex-1 basis-40 text-muted">Para: {r.forWhom}</span>
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
      </div>
    </section>
  );
}

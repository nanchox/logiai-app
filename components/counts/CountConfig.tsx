"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { btn, btnDanger, btnPrimary, ErrorText, input, label } from "@/components/manual/ui";
import { DAY_LABEL, LOCATION_KIND_LABEL } from "@/lib/labels";
import { createClient } from "@/lib/supabase/client";
import { deleteGuide, saveCapacity, saveGuideNote, saveReservationDefault, uploadGuide } from "@/lib/counts/mutations";
import type { CountGuide, CountLocation, Entrance, EntranceQuota, ReservationDefault, ReservationZone } from "@/lib/counts/types";
import { formatMeetingTime, type Meeting } from "@/lib/service/meetings";
import { EntrancesConfig } from "./EntrancesConfig";

type Site = { id: string; slug: string; name: string };
const DAYS = ["miercoles", "sabado", "domingo"] as const;

function useAction() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const run = async (fn: () => Promise<string | void>) => {
    setBusy(true); setError(null); setDone(null);
    try { setDone((await fn()) ?? null); router.refresh(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return { busy, error, done, run };
}

type Slot = { id: string; siteId: string; day: string; shift: string };

export function CountConfig({ sites, locations, guides, zones, defaults, entrances, quotas, slots, meetings }: {
  sites: Site[]; locations: CountLocation[]; guides: CountGuide[]; zones: ReservationZone[]; defaults: ReservationDefault[];
  entrances: Entrance[]; quotas: EntranceQuota[]; slots: Slot[]; meetings: Record<string, Meeting[]>;
}) {
  if (!sites.length) return <p className="text-muted">No hay sedes disponibles.</p>;
  return (
    <div className="space-y-8">
      {sites.map((s) => (
        <section key={s.id} aria-label={s.name} className="space-y-4">
          <h2 className="text-xl font-extrabold">{s.name}</h2>
          <Capacity site={s} locations={locations.filter((l) => l.siteId === s.id)} />
          <EntrancesConfig siteName={s.name} locations={locations.filter((l) => l.siteId === s.id)} entrances={entrances} quotas={quotas} slots={slots.filter((x) => x.siteId === s.id)} meetings={meetings} zones={zones.filter((z) => z.siteId === s.id)} defaults={defaults} />
          <Reservations site={s} zones={zones.filter((z) => z.siteId === s.id)} defaults={defaults} slots={slots.filter((x) => x.siteId === s.id)} meetings={meetings} />
          <Guides site={s} guides={guides.filter((g) => g.siteId === s.id)} />
        </section>
      ))}
    </div>
  );
}

function Capacity({ site, locations }: { site: Site; locations: CountLocation[] }) {
  const sb = useMemo(() => createClient(), []);
  const { busy, error, done, run } = useAction();
  const [vals, setVals] = useState<Record<string, string>>(Object.fromEntries(locations.map((l) => [l.id, l.capacity === null ? "" : String(l.capacity)])));
  const changed = locations.filter((l) => (vals[l.id] ?? "") !== (l.capacity === null ? "" : String(l.capacity)));
  return (
    <form className="space-y-3 rounded-2xl border border-line bg-surface p-5" aria-label={`Capacidad de ${site.name}`} onSubmit={(e) => {
      e.preventDefault();
      run(async () => {
        for (const l of changed) { const v = (vals[l.id] ?? "").trim(); await saveCapacity(sb, l.id, v === "" ? null : Number(v)); }
        return "Capacidades guardadas.";
      });
    }}>
      <div>
        <h3 className="text-lg font-extrabold">Capacidad de las ubicaciones</h3>
        <p className="text-sm text-muted">Total de sillas de cada ubicación. Al terminar el servicio, el total contado no puede superarla. Déjala vacía si esa ubicación no se cuenta.</p>
      </div>
      {locations.length === 0 ? <p className="text-sm text-muted">Esta sede todavía no tiene ubicaciones: créalas en el Manual.</p> : (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {locations.map((l) => (
            <li key={l.id} className="grid items-center gap-2 px-3 py-2 sm:grid-cols-[1fr_9rem]">
              <label htmlFor={`cap-${l.id}`} className="font-semibold">{l.name} <span className="text-sm font-normal text-muted">· {LOCATION_KIND_LABEL[l.kind] ?? l.kind}</span></label>
              <input id={`cap-${l.id}`} type="number" inputMode="numeric" min={0} max={100000} className={input} value={vals[l.id] ?? ""} onChange={(e) => setVals({ ...vals, [l.id]: e.target.value })} placeholder="Sin capacidad" />
            </li>
          ))}
        </ul>
      )}
      <ErrorText error={error} />
      {done && <p role="status" className="rounded-lg border border-primary/50 bg-primary/10 p-2 text-sm">{done}</p>}
      <button type="submit" className={btnPrimary} disabled={busy || changed.length === 0}>Guardar capacidades</button>
    </form>
  );
}

function Reservations({ site, zones, defaults, slots, meetings }: { site: Site; zones: ReservationZone[]; defaults: ReservationDefault[]; slots: Slot[]; meetings: Record<string, Meeting[]> }) {
  const sb = useMemo(() => createClient(), []);
  const { busy, error, done, run } = useAction();
  const key = (zoneId: string, day: string, meetingId: string | null) => `${zoneId}:${day}:${meetingId ?? "todas"}`;
  const initial = useMemo(() => Object.fromEntries(defaults.map((d) => [key(d.zoneId, d.day, d.meetingId), String(d.seats)])), [defaults]);
  const [vals, setVals] = useState<Record<string, string>>(initial);
  const [base, setBase] = useState<Record<string, string>>(initial);
  // Un bloque por día de la semana: «Todas las reuniones» y una columna por reunión de ese día.
  const days = DAYS.filter((d) => slots.some((s) => s.day === d)).map((d) => ({ day: d, cols: [{ id: null as string | null, title: "Todas" }, ...slots.filter((s) => s.day === d).flatMap((s) => meetings[s.id] ?? []).map((m) => ({ id: m.id as string | null, title: formatMeetingTime(m.time) + (m.label ? ` · ${m.label}` : "") }))] }));
  const cells = zones.flatMap((z) => days.flatMap((d) => d.cols.map((c) => ({ zone: z, day: d.day, meetingId: c.id, k: key(z.id, d.day, c.id) }))));
  const changed = cells.filter((c) => (vals[c.k] ?? "") !== (base[c.k] ?? ""));
  const bad = (k: string) => { const v = (vals[k] ?? "").trim(); return v !== "" && (!Number.isInteger(Number(v)) || Number(v) < 0 || Number(v) > 10000); };
  return (
    <form className="space-y-3 rounded-2xl border border-line bg-surface p-5" aria-label={`Reservas por zona de ${site.name}`} onSubmit={(e) => {
      e.preventDefault();
      run(async () => {
        for (const c of changed) { const v = (vals[c.k] ?? "").trim(); await saveReservationDefault(sb, c.zone.id, c.day, c.meetingId, v === "" ? null : Number(v)); }
        setBase({ ...vals });
        return "Reservas predeterminadas guardadas.";
      });
    }}>
      <div>
        <h3 className="text-lg font-extrabold">Reservas por zona (predeterminadas)</h3>
        <p className="text-sm text-muted">Puestos reservados en una fila de cada zona, por día y reunión. «Todas» aplica a todas las reuniones del día; el número de una reunión concreta tiene prioridad. Se repiten cada semana; durante un servicio, el coordinador o el supervisor pueden cambiarlos solo para ese día. Vacío = sin reserva.</p>
      </div>
      {zones.length === 0 ? <p className="text-sm text-muted">Esta sede todavía no tiene zonas: créalas en el Manual (cada espacio tiene sus zonas).</p> : (
        <div className="space-y-4">
          {days.map((d) => (
            <div key={d.day} className="overflow-x-auto rounded-lg border border-line">
              <table className="w-full min-w-[32rem] text-left text-sm" aria-label={`Reservas del ${DAY_LABEL[d.day]}`}>
                <thead className="bg-bg"><tr><th className="p-2">{DAY_LABEL[d.day]}</th>{d.cols.map((c) => <th key={c.id ?? "todas"} className="p-2">{c.title}</th>)}</tr></thead>
                <tbody className="divide-y divide-line">
                  {zones.map((z) => (
                    <tr key={z.id}>
                      <th scope="row" className="p-2 font-semibold">{z.name} <span className="font-normal text-muted">· {z.locationName}</span></th>
                      {d.cols.map((c) => (
                        <td key={c.id ?? "todas"} className="p-2">
                          <input type="number" inputMode="numeric" min={0} max={10000} className={`${input} ${bad(key(z.id, d.day, c.id)) ? "!border-danger" : ""}`} aria-label={`Reservas de ${z.name}, ${DAY_LABEL[d.day]}, ${c.id ? c.title : "todas las reuniones"}`}
                            value={vals[key(z.id, d.day, c.id)] ?? ""} onChange={(e) => setVals({ ...vals, [key(z.id, d.day, c.id)]: e.target.value })} placeholder="—" />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
          {days.length === 0 && <p className="text-sm text-muted">Esta sede todavía no tiene horarios de servicio.</p>}
        </div>
      )}
      <ErrorText error={error} />
      {done && <p role="status" className="rounded-lg border border-primary/50 bg-primary/10 p-2 text-sm">{done}</p>}
      <button type="submit" className={btnPrimary} disabled={busy || changed.length === 0 || changed.some((c) => bad(c.k))}>Guardar reservas</button>
    </form>
  );
}

function Guides({ site, guides }: { site: Site; guides: CountGuide[] }) {
  return (
    <div className="space-y-3 rounded-2xl border border-line bg-surface p-5">
      <div>
        <h3 className="text-lg font-extrabold">Guía de conteo (imagen)</h3>
        <p className="text-sm text-muted">Una imagen por día de la semana que indica cómo y dónde contar en cada entrada. Se repite cada semana hasta que la reemplaces. La ve el grupo que sirve ese día.</p>
      </div>
      <div className="grid min-w-0 gap-4 lg:grid-cols-3">
        {DAYS.map((d) => <GuideDay key={d} site={site} day={d} guide={guides.find((g) => g.day === d) ?? null} />)}
      </div>
    </div>
  );
}

function GuideDay({ site, day, guide }: { site: Site; day: string; guide: CountGuide | null }) {
  const sb = useMemo(() => createClient(), []);
  const { busy, error, done, run } = useAction();
  const [note, setNote] = useState(guide?.note ?? "");
  const title = DAY_LABEL[day];
  return (
    <article aria-label={`Guía del ${title} en ${site.name}`} className="min-w-0 space-y-2 rounded-xl border border-line bg-bg p-3">
      <h4 className="font-bold">{title}</h4>
      {guide?.url ? (
        <a href={guide.url} target="_blank" rel="noreferrer">
          {/* eslint-disable-next-line @next/next/no-img-element -- imagen firmada y privada */}
          <img src={guide.url} alt={`Guía de conteo del ${title}`} className="max-h-48 w-full rounded border border-line bg-white object-contain" />
        </a>
      ) : <p className="text-sm text-muted">Sin guía todavía.</p>}
      <div>
        <label className={label} htmlFor={`gn-${site.id}-${day}`}>Nota (opcional)</label>
        <div className="flex gap-2">
          <input id={`gn-${site.id}-${day}`} className={input} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej.: cuenten de 8:00 a 9:30" />
          {guide && <button type="button" className={btn} disabled={busy || note.trim() === (guide.note ?? "")} onClick={() => run(async () => { await saveGuideNote(sb, site.id, day, note); return "Nota guardada."; })}>Guardar</button>}
        </div>
      </div>
      <div>
        <label className={label} htmlFor={`gf-${site.id}-${day}`}>{guide ? "Reemplazar imagen" : "Subir imagen"}</label>
        <input id={`gf-${site.id}-${day}`} type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} className="max-w-full text-sm" onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) run(async () => { await uploadGuide(sb, site, day, f, note, guide?.path); return "Guía guardada."; });
          e.target.value = "";
        }} />
      </div>
      {guide && <button type="button" className={btnDanger} disabled={busy} onClick={() => { if (window.confirm(`¿Quitar la guía del ${title}?`)) run(() => deleteGuide(sb, site.id, day, guide.path)); }}>Quitar guía</button>}
      <ErrorText error={error} />
      {done && <p role="status" className="text-sm text-muted">{done}</p>}
    </article>
  );
}

"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { btn, btnDanger, btnPrimary, ErrorText, input, label } from "@/components/manual/ui";
import { createEntrance, deleteEntrance, saveStandardQuota, updateEntrance } from "@/lib/counts/mutations";
import type { CountLocation, Entrance, EntranceQuota } from "@/lib/counts/types";
import { DAY_LABEL, SHIFT_LABEL } from "@/lib/labels";
import { formatMeetingTime, type Meeting } from "@/lib/service/meetings";
import { createClient } from "@/lib/supabase/client";

type Slot = { id: string; day: string; shift: string };

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

/** Entradas de las ubicaciones de una sede, con su cupo estándar por reunión de cada horario. */
export function EntrancesConfig({ siteName, locations, entrances, quotas, slots, meetings }: {
  siteName: string; locations: CountLocation[]; entrances: Entrance[]; quotas: EntranceQuota[]; slots: Slot[]; meetings: Record<string, Meeting[]>;
}) {
  return (
    <div className="space-y-3 rounded-2xl border border-line bg-surface p-5" role="group" aria-label={`Entradas de ${siteName}`}>
      <div>
        <h3 className="text-lg font-extrabold">Entradas de las ubicaciones</h3>
        <p className="text-sm text-muted">Cada auditorio o lugar tiene entradas (izquierda, derecha…) con un <strong>cupo</strong>: cuántas personas se espera que entren por ahí en cada reunión, y una nota de quiénes ingresan. El cupo de cada entrada, más las reservas, debe sumar el aforo.</p>
      </div>
      {locations.length === 0 && <p className="text-sm text-muted">Esta sede todavía no tiene ubicaciones: créalas en el Manual.</p>}
      {locations.map((l) => (
        <LocationEntrances key={l.id} location={l} entrances={entrances.filter((e) => e.locationId === l.id)} quotas={quotas} slots={slots} meetings={meetings} />
      ))}
    </div>
  );
}

function LocationEntrances({ location, entrances, quotas, slots, meetings }: { location: CountLocation; entrances: Entrance[]; quotas: EntranceQuota[]; slots: Slot[]; meetings: Record<string, Meeting[]> }) {
  const sb = useMemo(() => createClient(), []);
  const { busy, error, done, run } = useAction();
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  return (
    <article className="space-y-3 rounded-xl border border-line bg-bg p-4" aria-label={`Entradas de ${location.name}`}>
      <h4 className="font-bold">{location.name} <span className="text-sm font-normal text-muted">· aforo {location.capacity ?? "sin registrar"}</span></h4>
      {entrances.length === 0 ? <p className="text-sm text-muted">Sin entradas todavía.</p> : (
        <ul className="space-y-2">
          {entrances.map((e) => <EntranceRow key={e.id} entrance={e} />)}
        </ul>
      )}
      <form className="flex flex-wrap items-end gap-2" aria-label={`Agregar entrada a ${location.name}`} onSubmit={(ev) => { ev.preventDefault(); run(async () => { await createEntrance(sb, location.id, name, note); setName(""); setNote(""); }); }}>
        <div className="min-w-40 flex-1">
          <label className={label} htmlFor={`en-${location.id}`}>Nueva entrada</label>
          <input id={`en-${location.id}`} className={input} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Entrada izquierda" />
        </div>
        <div className="min-w-48 flex-[2]">
          <label className={label} htmlFor={`enn-${location.id}`}>Quiénes ingresan (nota)</label>
          <input id={`enn-${location.id}`} className={input} value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="Asistentes de la iglesia" />
        </div>
        <button className={btn} disabled={busy || !name.trim()}>＋ Agregar entrada</button>
      </form>
      <ErrorText error={error} />
      {entrances.length > 0 && slots.map((s) => (
        <QuotaTable key={s.id} slot={s} location={location} entrances={entrances} quotas={quotas} meetings={meetings[s.id] ?? []} />
      ))}
      {done && <p role="status" className="text-sm text-muted">{done}</p>}
    </article>
  );
}

function EntranceRow({ entrance }: { entrance: Entrance }) {
  const sb = useMemo(() => createClient(), []);
  const { busy, error, run } = useAction();
  const [name, setName] = useState(entrance.name);
  const [note, setNote] = useState(entrance.note ?? "");
  const dirty = name.trim() !== entrance.name || note.trim() !== (entrance.note ?? "");
  return (
    <li className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <input className={`${input} w-48`} aria-label={`Nombre de la entrada ${entrance.name}`} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
        <input className={`${input} min-w-48 flex-1`} aria-label={`Nota de ${entrance.name}`} value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="Quiénes ingresan" />
        <button type="button" className={btn} disabled={busy || !dirty || !name.trim()} onClick={() => run(() => updateEntrance(sb, entrance.id, name, note))}>Guardar</button>
        <button type="button" className={btnDanger} disabled={busy} aria-label={`Eliminar la entrada ${entrance.name}`}
          onClick={() => { if (window.confirm(`¿Eliminar la entrada «${entrance.name}» y sus cupos?`)) run(() => deleteEntrance(sb, entrance.id)); }}>Eliminar</button>
      </div>
      <ErrorText error={error} />
    </li>
  );
}

function QuotaTable({ slot, location, entrances, quotas, meetings }: { slot: Slot; location: CountLocation; entrances: Entrance[]; quotas: EntranceQuota[]; meetings: Meeting[] }) {
  const sb = useMemo(() => createClient(), []);
  const { busy, error, done, run } = useAction();
  const title = [DAY_LABEL[slot.day], SHIFT_LABEL[slot.shift]].filter(Boolean).join(" ");
  const key = (e: string, m: string) => `${e}:${m}`;
  const initial = useMemo(() => Object.fromEntries(quotas.map((q) => [key(q.entranceId, q.meetingId), String(q.quota)])), [quotas]);
  const [vals, setVals] = useState<Record<string, string>>(initial);
  const [base, setBase] = useState<Record<string, string>>(initial);
  const cells = entrances.flatMap((e) => meetings.map((m) => ({ e, m, k: key(e.id, m.id) })));
  const changed = cells.filter((c) => (vals[c.k] ?? "") !== (base[c.k] ?? ""));
  const bad = (k: string) => { const v = (vals[k] ?? "").trim(); return v !== "" && (!Number.isInteger(Number(v)) || Number(v) < 0 || Number(v) > 100000); };
  const colTotal = (m: Meeting) => entrances.reduce((s, e) => s + (Number(vals[key(e.id, m.id)]) || 0), 0);

  if (meetings.length === 0) {
    return <p className="rounded-lg border border-dashed border-line p-3 text-sm text-muted">Para dar cupos el {title}, primero define sus reuniones en <strong>Personas → Grupos y horarios</strong>.</p>;
  }
  return (
    <form className="space-y-2" aria-label={`Cupos de ${location.name} · ${title}`} onSubmit={(ev) => {
      ev.preventDefault();
      run(async () => {
        for (const c of changed) { const v = (vals[c.k] ?? "").trim(); await saveStandardQuota(sb, c.e.id, c.m.id, v === "" ? null : Number(v)); }
        setBase({ ...vals });
        return "Cupos guardados.";
      });
    }}>
      <p className="text-sm font-semibold">Cupos estándar · {title}</p>
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full min-w-[28rem] text-left text-sm">
          <thead className="bg-surface"><tr><th className="p-2">Entrada</th>{meetings.map((m) => <th key={m.id} className="p-2">{formatMeetingTime(m.time)}{m.label ? ` · ${m.label}` : ""}</th>)}</tr></thead>
          <tbody className="divide-y divide-line">
            {entrances.map((e) => (
              <tr key={e.id}>
                <th scope="row" className="p-2 font-semibold">{e.name}{e.note && <span className="block text-xs font-normal text-muted">{e.note}</span>}</th>
                {meetings.map((m) => (
                  <td key={m.id} className="p-2">
                    <input type="number" inputMode="numeric" min={0} max={100000} className={`${input} ${bad(key(e.id, m.id)) ? "!border-danger" : ""}`} aria-label={`Cupo de ${e.name} a las ${formatMeetingTime(m.time)} (${title})`}
                      value={vals[key(e.id, m.id)] ?? ""} onChange={(ev) => setVals({ ...vals, [key(e.id, m.id)]: ev.target.value })} placeholder="—" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-surface"><tr><th scope="row" className="p-2">Suma de cupos</th>{meetings.map((m) => <td key={m.id} className="p-2 font-bold">{colTotal(m)}</td>)}</tr></tfoot>
        </table>
      </div>
      <ErrorText error={error} />
      {done && <p role="status" className="text-sm text-muted">{done}</p>}
      <button className={btnPrimary} disabled={busy || changed.length === 0 || changed.some((c) => bad(c.k))}>Guardar cupos</button>
    </form>
  );
}

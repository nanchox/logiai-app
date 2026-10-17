"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DAY_LABEL, SHIFT_LABEL } from "@/lib/labels";
import { createClient } from "@/lib/supabase/client";
import { createGroup, createSlot, deleteGroup, deleteSlot, renameGroup, updateSlot } from "@/lib/people/mutations";
import type { GroupItem, SiteItem, SlotItem } from "@/lib/people/types";
import { btn, btnDanger, btnPrimary, ErrorText, input, label } from "@/components/manual/ui";

const hhmm = (t: string | null) => (t ? t.slice(0, 5) : "");
const slotTitle = (s: Pick<SlotItem, "day" | "shift">) => [DAY_LABEL[s.day], SHIFT_LABEL[s.shift]].filter(Boolean).join(" ");

function useAction() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try { await fn(); router.refresh(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return { busy, error, run };
}

export function GroupsAdmin({ sites, slots, groups }: { sites: SiteItem[]; slots: SlotItem[]; groups: GroupItem[] }) {
  if (!sites.length) return <p className="text-muted">No hay sedes disponibles.</p>;
  return (
    <div className="space-y-8">
      {sites.map((site) => (
        <section key={site.id} aria-label={site.name} className="space-y-4">
          <h2 className="text-xl font-extrabold">{site.name}</h2>
          {slots.filter((s) => s.siteId === site.id).map((slot) => (
            <SlotCard key={slot.id} slot={slot} groups={groups.filter((g) => g.slotId === slot.id)} />
          ))}
          {!slots.some((s) => s.siteId === site.id) && <p className="text-sm text-muted">Esta sede todavía no tiene horarios de servicio.</p>}
          <NewSlot siteId={site.id} siteName={site.name} existing={slots.filter((s) => s.siteId === site.id)} />
        </section>
      ))}
    </div>
  );
}

function SlotCard({ slot, groups }: { slot: SlotItem; groups: GroupItem[] }) {
  const sb = useMemo(() => createClient(), []);
  const { busy, error, run } = useAction();
  const [times, setTimes] = useState({ arrival: hhmm(slot.arrival), start: hhmm(slot.start), end: hhmm(slot.end) });
  const [names, setNames] = useState("");
  const title = slotTitle(slot);

  return (
    <article className="space-y-4 rounded-2xl border border-line bg-surface p-5" aria-label={`Horario ${title}`}>
      <div className="flex flex-wrap items-start gap-3">
        <h3 className="flex-1 text-lg font-extrabold text-link">{title}</h3>
        <button type="button" className={btnDanger} disabled={busy} onClick={() => {
          if (window.confirm(`¿Eliminar el horario «${title}» y sus grupos vacíos? Si algún grupo tiene integrantes, no se podrá.`)) run(() => deleteSlot(sb, slot.id));
        }}>Eliminar horario</button>
      </div>

      <form className="flex flex-wrap items-end gap-3" aria-label={`Horas de ${title}`} onSubmit={(e) => { e.preventDefault(); run(() => updateSlot(sb, slot.id, times)); }}>
        {([["arrival", "Llegada"], ["start", "Inicio"], ["end", "Fin"]] as const).map(([k, l]) => (
          <div key={k}>
            <label className={label} htmlFor={`${slot.id}-${k}`}>{l}</label>
            <input id={`${slot.id}-${k}`} type="time" className={`${input} w-32`} value={times[k]} onChange={(e) => setTimes({ ...times, [k]: e.target.value })} />
          </div>
        ))}
        <button className={btn} disabled={busy}>Guardar horas</button>
      </form>

      <ul className="space-y-2">
        {groups.map((g) => <GroupRow key={g.id} group={g} />)}
        {groups.length === 0 && <li className="text-sm text-muted">Sin grupos todavía.</li>}
      </ul>

      <form className="flex flex-wrap items-end gap-3 border-t border-line pt-4" aria-label={`Agregar grupos a ${title}`} onSubmit={(e) => {
        e.preventDefault();
        const list = names.split(/[,\n]/).map((n) => n.trim()).filter(Boolean);
        if (list.length) run(async () => { for (const n of list) await createGroup(sb, slot.id, n); setNames(""); });
      }}>
        <div className="min-w-60 flex-1">
          <label className={label} htmlFor={`${slot.id}-new`}>Agregar grupos (separados por comas)</label>
          <input id={`${slot.id}-new`} className={input} value={names} placeholder="Grupo 1, Grupo 2, Grupo 3" onChange={(e) => setNames(e.target.value)} />
        </div>
        <button className={btnPrimary} disabled={busy || !names.trim()}>Agregar</button>
      </form>
      <ErrorText error={error} />
    </article>
  );
}

function GroupRow({ group }: { group: GroupItem }) {
  const sb = useMemo(() => createClient(), []);
  const { busy, error, run } = useAction();
  const [name, setName] = useState(group.name);
  return (
    <li className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <input className={`${input} max-w-56`} value={name} aria-label={`Nombre de ${group.name}`} onChange={(e) => setName(e.target.value)} />
        <button type="button" className={btn} disabled={busy || !name.trim() || name.trim() === group.name} onClick={() => run(() => renameGroup(sb, group.id, name))}>Renombrar</button>
        <span className="text-sm text-muted">{group.memberCount} integrante{group.memberCount === 1 ? "" : "s"}</span>
        <button type="button" className={btnDanger} disabled={busy || group.memberCount > 0}
          title={group.memberCount > 0 ? "Mueve primero a sus integrantes a otro grupo" : undefined} aria-label={`Eliminar ${group.name}`}
          onClick={() => { if (window.confirm(`¿Eliminar el grupo «${group.name}»?`)) run(() => deleteGroup(sb, group.id)); }}>Eliminar</button>
      </div>
      <ErrorText error={error} />
    </li>
  );
}

function NewSlot({ siteId, siteName, existing }: { siteId: string; siteName: string; existing: SlotItem[] }) {
  const sb = useMemo(() => createClient(), []);
  const { busy, error, run } = useAction();
  const [v, setV] = useState({ day: "sabado", shift: "unica", arrival: "", start: "", end: "" });
  const taken = existing.some((s) => s.day === v.day && s.shift === v.shift);
  return (
    <details className="rounded-2xl border border-dashed border-line p-4">
      <summary className="cursor-pointer font-bold">＋ Nuevo horario en {siteName}</summary>
      <form className="mt-3 space-y-3" aria-label={`Nuevo horario en ${siteName}`} onSubmit={(e) => { e.preventDefault(); run(async () => { await createSlot(sb, { siteId, ...v }); }); }}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={label} htmlFor={`${siteId}-day`}>Día</label>
            <select id={`${siteId}-day`} className={input} value={v.day} onChange={(e) => setV({ ...v, day: e.target.value })}>
              {Object.entries(DAY_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className={label} htmlFor={`${siteId}-shift`}>Franja</label>
            <select id={`${siteId}-shift`} className={input} value={v.shift} onChange={(e) => setV({ ...v, shift: e.target.value })}>
              <option value="unica">Única (un solo servicio ese día)</option>
              <option value="am">AM (mañana)</option>
              <option value="pm">PM (tarde)</option>
            </select>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          {([["arrival", "Llegada"], ["start", "Inicio"], ["end", "Fin"]] as const).map(([k, l]) => (
            <div key={k}>
              <label className={label} htmlFor={`${siteId}-n-${k}`}>{l} (opcional)</label>
              <input id={`${siteId}-n-${k}`} type="time" className={`${input} w-32`} value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} />
            </div>
          ))}
        </div>
        {taken && <p className="text-sm text-danger">Ya existe un horario de {slotTitle(v)} en esta sede.</p>}
        <ErrorText error={error} />
        <button className={btnPrimary} disabled={busy || taken}>Crear horario</button>
      </form>
    </details>
  );
}

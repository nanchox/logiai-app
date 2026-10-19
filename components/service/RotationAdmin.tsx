"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { btn, btnDanger, btnPrimary, ErrorText, input, label } from "@/components/manual/ui";
import { serviceLabel } from "@/lib/labels";
import { createClient } from "@/lib/supabase/client";
import type { SiteItem, SlotItem } from "@/lib/people/types";
import { addDays, formatServiceDateShort } from "@/lib/service/dates";
import { addCancellation, createSpecialEvent, deleteCancellation, describeGenerate, generateEvents, moveGroup } from "@/lib/service/mutations";
import type { Cancellation, RotationGroup, ServiceEvent } from "@/lib/service/types";

function useAction() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const run = async (fn: () => Promise<string | void>) => {
    setBusy(true);
    setError(null);
    setDone(null);
    try { setDone((await fn()) ?? null); router.refresh(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return { busy, error, done, run };
}

export function StatusBadges({ e }: { e: Pick<ServiceEvent, "status" | "kind" | "manual" | "cancelReason"> }) {
  return (
    <>
      {e.status === "cancelado" && <span className="rounded-full bg-danger px-2 py-0.5 text-xs font-bold text-white">Cancelado{e.cancelReason ? ` · ${e.cancelReason}` : ""}</span>}
      {e.kind === "especial" && <span className="rounded-full bg-badge px-2 py-0.5 text-xs font-bold text-on-badge">Especial</span>}
      {e.kind === "rotacion" && e.manual && <span className="rounded-full border border-line px-2 py-0.5 text-xs font-bold">Ajustado a mano</span>}
    </>
  );
}

export function RotationAdmin({
  sites, slots, groups, events, cancellations, today, canAllSites,
}: { sites: SiteItem[]; slots: SlotItem[]; groups: RotationGroup[]; events: ServiceEvent[]; cancellations: Cancellation[]; today: string; canAllSites: boolean }) {
  if (!sites.length) return <p className="text-muted">No hay sedes disponibles.</p>;
  return (
    <div className="space-y-8">
      {sites.map((site) => (
        <section key={site.id} aria-label={site.name} className="space-y-4">
          <h2 className="text-xl font-extrabold">{site.name}</h2>
          {slots.filter((s) => s.siteId === site.id).map((slot) => (
            <SlotRotation key={slot.id} slot={slot} groups={groups.filter((g) => g.slotId === slot.id)} events={events.filter((e) => e.slotId === slot.id)} today={today} />
          ))}
          {!slots.some((s) => s.siteId === site.id) && <p className="text-sm text-muted">Esta sede todavía no tiene horarios. Créalos en Grupos y horarios.</p>}
        </section>
      ))}
      <Cancellations sites={sites} slots={slots} cancellations={cancellations} today={today} canAllSites={canAllSites} />
    </div>
  );
}

function SlotRotation({ slot, groups, events, today }: { slot: SlotItem; groups: RotationGroup[]; events: ServiceEvent[]; today: string }) {
  const sb = useMemo(() => createClient(), []);
  const { busy, error, done, run } = useAction();
  const title = serviceLabel(slot.day, slot.shift);
  const ordered = [...groups].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, "es", { numeric: true }));
  const [range, setRange] = useState({ from: today, until: addDays(today, 84) });
  const [first, setFirst] = useState("");
  const [special, setSpecial] = useState({ date: "", group: ordered[0]?.id ?? "", note: "" });
  const upcoming = events.slice(0, 8);

  return (
    <article className="space-y-5 rounded-2xl border border-line bg-surface p-5" aria-label={`Rotación ${title}`}>
      <h3 className="text-lg font-extrabold text-link">{title}</h3>
      <ErrorText error={error} />
      {done && <p role="status" className="rounded-lg border border-primary/50 bg-primary/10 p-2 text-sm">{done}</p>}

      {ordered.length === 0 ? (
        <p className="text-sm text-muted">Este horario no tiene grupos: créalos en Grupos y horarios para armar la rotación.</p>
      ) : (
        <>
          <div>
            <h4 className={label}>Orden de rotación</h4>
            <ol className="space-y-1">
              {ordered.map((g, i) => (
                <li key={g.id} className="flex items-center gap-2 rounded-lg border border-line bg-bg px-3 py-1.5">
                  <span className="w-6 text-sm font-bold text-muted">{i + 1}</span>
                  <span className="flex-1 font-semibold">{g.name}</span>
                  <button type="button" className={btn} aria-label={`Subir ${g.name}`} disabled={busy || i === 0} onClick={() => run(() => moveGroup(sb, ordered, i, -1))}>↑</button>
                  <button type="button" className={btn} aria-label={`Bajar ${g.name}`} disabled={busy || i === ordered.length - 1} onClick={() => run(() => moveGroup(sb, ordered, i, 1))}>↓</button>
                </li>
              ))}
            </ol>
            <p className="mt-2 text-xs text-muted">Cambiar el orden o agregar un grupo solo afecta las fechas que generes de nuevo. Cada semana toca el siguiente grupo; una fecha cancelada pierde su turno y la rotación sigue.</p>
          </div>

          <form className="grid gap-3 sm:grid-cols-4" aria-label={`Generar servicios de ${title}`} onSubmit={(e) => {
            e.preventDefault();
            run(async () => describeGenerate(await generateEvents(sb, slot.id, range.from, range.until, first)));
          }}>
            <div><label className={label} htmlFor={`f-${slot.id}`}>Desde</label><input id={`f-${slot.id}`} type="date" className={input} value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} required /></div>
            <div><label className={label} htmlFor={`u-${slot.id}`}>Hasta</label><input id={`u-${slot.id}`} type="date" className={input} value={range.until} onChange={(e) => setRange({ ...range, until: e.target.value })} required /></div>
            <div>
              <label className={label} htmlFor={`g-${slot.id}`}>Empieza con (si es la primera vez)</label>
              <select id={`g-${slot.id}`} className={input} value={first} onChange={(e) => setFirst(e.target.value)}>
                <option value="">Primero del orden</option>
                {ordered.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
            <div className="flex items-end"><button type="submit" className={`${btnPrimary} w-full`} disabled={busy}>Generar servicios</button></div>
          </form>
        </>
      )}

      <div>
        <h4 className={label}>Próximos servicios</h4>
        {upcoming.length === 0 ? <p className="text-sm text-muted">Todavía no hay fechas generadas.</p> : (
          <ul className="divide-y divide-line rounded-lg border border-line">
            {upcoming.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                <span className="w-32 font-semibold">{formatServiceDateShort(e.date)}</span>
                <span className="flex-1">{e.groupName ?? "Sin grupo"}</span>
                <StatusBadges e={e} />
                <Link href={`/servicio/${e.id}`} className="text-sm font-semibold">Abrir</Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {ordered.length > 0 && (
        <form className="grid gap-3 sm:grid-cols-4" aria-label={`Servicio especial de ${title}`} onSubmit={(e) => {
          e.preventDefault();
          run(async () => { await createSpecialEvent(sb, slot.id, special.date, special.group, special.note); setSpecial({ ...special, date: "", note: "" }); return "Servicio especial creado."; });
        }}>
          <div><label className={label} htmlFor={`sd-${slot.id}`}>Servicio especial · fecha</label><input id={`sd-${slot.id}`} type="date" className={input} value={special.date} onChange={(e) => setSpecial({ ...special, date: e.target.value })} required /></div>
          <div>
            <label className={label} htmlFor={`sg-${slot.id}`}>Grupo que sirve</label>
            <select id={`sg-${slot.id}`} className={input} value={special.group} onChange={(e) => setSpecial({ ...special, group: e.target.value })}>
              {ordered.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
          <div><label className={label} htmlFor={`sn-${slot.id}`}>Nota (opcional)</label><input id={`sn-${slot.id}`} className={input} maxLength={500} value={special.note} onChange={(e) => setSpecial({ ...special, note: e.target.value })} placeholder="Vigilia, conferencia…" /></div>
          <div className="flex items-end"><button type="submit" className={`${btn} w-full`} disabled={busy}>Crear servicio especial</button></div>
        </form>
      )}
    </article>
  );
}

function Cancellations({ sites, slots, cancellations, today, canAllSites }: { sites: SiteItem[]; slots: SlotItem[]; cancellations: Cancellation[]; today: string; canAllSites: boolean }) {
  const sb = useMemo(() => createClient(), []);
  const { busy, error, done, run } = useAction();
  const [form, setForm] = useState({ date: "", scope: canAllSites ? "all" : `site:${sites[0]?.id}`, reason: "" });

  const scopes = [
    ...(canAllSites ? [{ value: "all", text: "Todas las sedes" }] : []),
    ...sites.flatMap((s) => [
      { value: `site:${s.id}`, text: `${s.name} · todos los horarios` },
      ...slots.filter((x) => x.siteId === s.id).map((x) => ({ value: `slot:${x.id}`, text: `${s.name} · ${serviceLabel(x.day, x.shift)}` })),
    ]),
  ];
  const submit = () => {
    const [kind, id] = form.scope.split(":");
    const slot = kind === "slot" ? slots.find((s) => s.id === id) : null;
    return addCancellation(sb, {
      date: form.date, reason: form.reason,
      siteId: kind === "site" ? id : slot ? slot.siteId : null,
      slotId: slot ? slot.id : null,
    });
  };
  const scopeText = (c: Cancellation) => c.slotId ? `${c.siteName} · ${serviceLabel(c.day ?? "", c.shift ?? "")}` : c.siteName ? `${c.siteName} · todos los horarios` : "Todas las sedes";

  return (
    <section aria-label="Cancelaciones" className="space-y-4 rounded-2xl border border-line bg-surface p-5">
      <div>
        <h2 className="text-xl font-extrabold">Cancelaciones</h2>
        <p className="text-sm text-muted">Navidad, Año Nuevo, un retiro… La fecha cancelada no la sirve nadie y ese turno se pierde: la rotación sigue con el grupo que le toca la semana siguiente.</p>
      </div>
      <ErrorText error={error} />
      {done && <p role="status" className="rounded-lg border border-primary/50 bg-primary/10 p-2 text-sm">{done}</p>}
      <form className="grid gap-3 sm:grid-cols-4" aria-label="Cancelar un servicio" onSubmit={(e) => {
        e.preventDefault();
        run(async () => { await submit(); setForm({ ...form, date: "", reason: "" }); return "Cancelación registrada."; });
      }}>
        <div><label className={label} htmlFor="c-date">Fecha</label><input id="c-date" type="date" className={input} min={today} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required /></div>
        <div>
          <label className={label} htmlFor="c-scope">Qué se cancela</label>
          <select id="c-scope" className={input} value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })}>
            {scopes.map((s) => <option key={s.value} value={s.value}>{s.text}</option>)}
          </select>
        </div>
        <div><label className={label} htmlFor="c-reason">Motivo (opcional)</label><input id="c-reason" className={input} maxLength={300} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Navidad" /></div>
        <div className="flex items-end"><button type="submit" className={`${btnDanger} w-full`} disabled={busy}>Cancelar servicio</button></div>
      </form>
      {cancellations.length === 0 ? <p className="text-sm text-muted">No hay cancelaciones próximas.</p> : (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {cancellations.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
              <span className="w-32 font-semibold">{formatServiceDateShort(c.date)}</span>
              <span className="flex-1">{scopeText(c)}{c.reason ? ` · ${c.reason}` : ""}</span>
              <button type="button" className={btn} disabled={busy} onClick={() => run(async () => { await deleteCancellation(sb, c.id); return "Cancelación quitada: el servicio vuelve a programarse."; })}>Quitar</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

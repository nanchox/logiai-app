"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { btn, btnPrimary, ErrorText, input } from "@/components/manual/ui";
import { GROUP_ROLE_LABEL } from "@/lib/labels";
import { createClient } from "@/lib/supabase/client";
import { assignPerson, copyPreviousPlan, savePositionNote, setPlanStatus, unassign } from "@/lib/service/mutations";
import type { PlanData, PlanPosition, ServiceEvent } from "@/lib/service/types";
import { canHold } from "@/lib/service/types";

export type Person = { userId: string; name: string; role: string };

function byLocation(positions: PlanPosition[]) {
  const out: { name: string; items: PlanPosition[] }[] = [];
  for (const p of positions) {
    const last = out[out.length - 1];
    if (last && last.name === p.locationName) last.items.push(p);
    else out.push({ name: p.locationName, items: [p] });
  }
  return out;
}

/** Planeación de posiciones del servicio: quien planifica la edita; el resto ve la publicada (y resalta lo suyo). */
export function PlanEditor({
  event, positions, people, plan, canPlan, meId,
}: { event: ServiceEvent; positions: PlanPosition[]; people: Person[]; plan: PlanData; canPlan: boolean; meId: string }) {
  const sb = useMemo(() => createClient(), []);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>(plan.notes);
  const [pick, setPick] = useState<Record<string, string>>({});

  const nameOf = (id: string) => people.find((p) => p.userId === id)?.name ?? "Integrante";
  const published = plan.status === "publicado";
  const run = async (fn: () => Promise<string | void>) => {
    setBusy(true);
    setError(null);
    setInfo(null);
    try { setInfo((await fn()) ?? null); router.refresh(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  if (!positions.length) return <p className="rounded-2xl border border-line bg-surface p-5 text-muted">El manual de esta sede todavía no tiene posiciones para este día y franja.</p>;

  const visible = canPlan ? positions : positions.filter((p) => plan.assignments.some((a) => a.positionId === p.id) || plan.notes[p.id]);
  if (!canPlan && !published) return <p className="rounded-2xl border border-line bg-surface p-5 text-muted">La planeación de posiciones todavía no está publicada.</p>;
  if (!canPlan && !visible.length) return <p className="rounded-2xl border border-line bg-surface p-5 text-muted">La planeación se publicó, pero todavía no tiene posiciones asignadas.</p>;

  return (
    <section aria-label="Planeación de posiciones" className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="flex-1 text-lg font-extrabold">Posiciones</h2>
        {canPlan && (
          <>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${published ? "bg-primary text-on-primary" : "border border-line"}`}>
              {published ? "Publicada" : plan.status ? "Borrador (solo coordinadores y supervisores)" : "Sin empezar"}
            </span>
            <button type="button" className={btn} disabled={busy} onClick={() => run(async () => {
              const r = await copyPreviousPlan(sb, event.id, event.groupId!, event.date, positions, people, plan);
              return `Copiado del servicio anterior: ${r.copied} asignaciones${r.skipped ? ` (${r.skipped} no aplican hoy)` : ""}.`;
            })}>Copiar servicio anterior</button>
            {published
              ? <button type="button" className={btn} disabled={busy} onClick={() => run(() => setPlanStatus(sb, event.id, "borrador"))}>Volver a borrador</button>
              : <button type="button" className={btnPrimary} disabled={busy || plan.assignments.length === 0} onClick={() => {
                  if (window.confirm("Al publicar, todo el grupo verá quién tiene cada posición. ¿Publicar?")) run(() => setPlanStatus(sb, event.id, "publicado"));
                }}>Publicar para el grupo</button>}
          </>
        )}
      </div>
      <ErrorText error={error} />
      {info && <p role="status" className="rounded-lg border border-primary/50 bg-primary/10 p-2 text-sm">{info}</p>}

      {byLocation(visible).map((loc) => (
        <div key={loc.name} className="space-y-2">
          <h3 className="text-sm font-bold uppercase tracking-wider text-muted">{loc.name}</h3>
          <ul className="space-y-2">
            {loc.items.map((p) => {
              const here = plan.assignments.filter((a) => a.positionId === p.id);
              const taken = new Set(here.map((a) => a.userId));
              const candidates = people.filter((x) => canHold(x.role, p.kind) && !taken.has(x.userId));
              const mine = here.some((a) => a.userId === meId);
              return (
                <li key={p.id} className={`rounded-xl border bg-surface p-3 ${mine ? "border-accent" : "border-line"}`} aria-label={`Posición ${p.code}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded px-1.5 py-0.5 text-xs font-extrabold ${p.kind === "supervisor" ? "bg-danger text-white" : "bg-info text-on-info"}`}>{p.code}</span>
                    <span className="font-bold">{p.name}</span>
                    {p.kind === "supervisor" && <span className="text-xs text-muted">Supervisor</span>}
                    {p.usesRadio && <span className="text-xs text-muted">· Radio</span>}
                    {mine && <span className="ml-auto rounded-full bg-accent px-2 py-0.5 text-xs font-bold text-on-accent">Tú</span>}
                  </div>

                  <ul className="mt-2 flex flex-wrap gap-2">
                    {here.length === 0 && <li className="text-sm text-muted">Sin asignar</li>}
                    {here.map((a) => (
                      <li key={a.id} className="flex items-center gap-1 rounded-full border border-line bg-bg py-1 pl-3 pr-1 text-sm">
                        <span className={a.userId === meId ? "font-bold" : ""}>{nameOf(a.userId)}</span>
                        {canPlan && <button type="button" className="rounded-full px-2 text-muted hover:text-danger" aria-label={`Quitar a ${nameOf(a.userId)} de ${p.code}`} disabled={busy} onClick={() => run(() => unassign(sb, a.id))}>×</button>}
                      </li>
                    ))}
                  </ul>

                  {canPlan ? (
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <div className="flex gap-2">
                        <select aria-label={`Agregar persona a ${p.code}`} className={input} value={pick[p.id] ?? ""} onChange={(e) => setPick({ ...pick, [p.id]: e.target.value })}>
                          <option value="">Agregar persona…</option>
                          {candidates.map((x) => <option key={x.userId} value={x.userId}>{x.name} · {GROUP_ROLE_LABEL[x.role]}</option>)}
                        </select>
                        <button type="button" className={btn} disabled={busy || !pick[p.id]} onClick={() => run(async () => { await assignPerson(sb, event.id, p.id, pick[p.id]); setPick({ ...pick, [p.id]: "" }); })}>Agregar</button>
                      </div>
                      <div className="flex gap-2">
                        <input aria-label={`Nota de ${p.code}`} className={input} maxLength={1000} placeholder="Nota o comentario de la posición" value={notes[p.id] ?? ""} onChange={(e) => setNotes({ ...notes, [p.id]: e.target.value })} />
                        <button type="button" className={btn} disabled={busy || (notes[p.id] ?? "") === (plan.notes[p.id] ?? "")} onClick={() => run(() => savePositionNote(sb, event.id, p.id, notes[p.id] ?? ""))}>Guardar</button>
                      </div>
                    </div>
                  ) : (
                    plan.notes[p.id] && <p className="mt-2 whitespace-pre-line text-sm text-muted">{plan.notes[p.id]}</p>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      {canPlan && <p className="text-xs text-muted">Una posición puede tener varias personas y una persona puede apoyar varias posiciones. Los coordinadores coordinan el grupo y no ocupan posiciones; las de supervisor son solo para supervisores.</p>}
    </section>
  );
}

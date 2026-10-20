"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { btn, btnDanger, btnPrimary, ErrorText, input, label } from "@/components/manual/ui";
import { GROUP_ROLE_LABEL } from "@/lib/labels";
import { createClient } from "@/lib/supabase/client";
import { loadCandidates } from "@/lib/support/load";
import { addSupporter, cancelSupportRequest, createSupportRequest, decideApplication, markAbsent, removeSupporter, unmarkAbsent } from "@/lib/support/mutations";
import type { Application, Candidate, EventPerson, EventRequest } from "@/lib/support/types";
import type { PlanPosition, ServiceEvent } from "@/lib/service/types";

const STATUS_TEXT: Record<Application["status"], string> = { pendiente: "Pendiente", aprobada: "Aprobada", rechazada: "Rechazada", retirada: "Retirada" };

/** Ausencias y apoyos del próximo servicio: marcar ausentes, agregar apoyos de otros grupos y pedir/aprobar apoyos. */
export function SupportPanel({
  event, people, request, applications, positions,
}: { event: ServiceEvent; people: EventPerson[]; request: EventRequest | null; applications: Application[]; positions: PlanPosition[] }) {
  const sb = useMemo(() => createClient(), []);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<Candidate[] | null>(null);
  const [form, setForm] = useState({ needed: "1", note: "", positions: [] as string[] });

  const run = async (fn: () => Promise<string | void>) => {
    setBusy(true);
    setError(null);
    setInfo(null);
    try { setInfo((await fn()) ?? null); router.refresh(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const search = () => run(async () => { setFound(await loadCandidates(sb, event.id, query)); });
  const posName = (id: string) => { const p = positions.find((x) => x.id === id); return p ? `${p.code} · ${p.name}` : id; };

  const members = people.filter((p) => p.origin === "miembro" && p.role !== "coordinador");
  const supporters = people.filter((p) => p.origin === "apoyo");
  const absentCount = people.filter((p) => p.absent).length;
  const missing = request ? Math.max(0, request.needed - request.filled) : 0;

  return (
    <section aria-label="Ausencias y apoyos" className="space-y-5 rounded-2xl border border-line bg-surface p-5">
      <div>
        <h2 className="text-lg font-extrabold">Ausencias y apoyos</h2>
        <p className="text-sm text-muted">
          Si alguien no puede venir, márcalo ausente (se le quitan sus posiciones) y suma apoyo de otros grupos de la sede. Solo aplica al próximo servicio de tu grupo.
          {absentCount > 0 && <> Ausentes: <strong>{absentCount}</strong>.</>}
        </p>
      </div>
      <ErrorText error={error} />
      {info && <p role="status" className="rounded-lg border border-primary/50 bg-primary/10 p-2 text-sm">{info}</p>}

      <div>
        <h3 className={label}>Quiénes sirven</h3>
        <ul className="divide-y divide-line rounded-lg border border-line">
          {[...members, ...supporters].map((p) => (
            <li key={p.userId} className="flex flex-wrap items-center gap-2 px-3 py-2" aria-label={p.name}>
              <span className={`font-semibold ${p.absent ? "line-through opacity-60" : ""}`}>{p.name}</span>
              <span className="text-xs text-muted">{GROUP_ROLE_LABEL[p.role]}</span>
              {p.origin === "apoyo" && <span className="rounded-full bg-info px-2 py-0.5 text-xs font-bold text-on-info">Apoyo de {p.groupName}</span>}
              {p.absent && <span className="rounded-full bg-danger px-2 py-0.5 text-xs font-bold text-white">Ausente</span>}
              <span className="ml-auto flex gap-2">
                {p.absent
                  ? <button type="button" className={btn} disabled={busy} aria-label={`Deshacer ausencia de ${p.name}`} onClick={() => run(() => unmarkAbsent(sb, event.id, p.userId))}>Deshacer ausencia</button>
                  : <button type="button" className={btn} disabled={busy} aria-label={`Marcar ausente a ${p.name}`} onClick={() => {
                      if (window.confirm(`¿Marcar a ${p.name} como ausente? Se le quitan sus posiciones de este servicio.`)) run(() => markAbsent(sb, event.id, p.userId));
                    }}>Marcar ausente</button>}
                {p.origin === "apoyo" && (
                  <button type="button" className={btnDanger} disabled={busy} aria-label={`Quitar el apoyo de ${p.name}`} onClick={() => {
                    if (window.confirm(`¿Quitar a ${p.name} como apoyo de este servicio?`)) run(() => removeSupporter(sb, event.id, p.userId));
                  }}>Quitar apoyo</button>
                )}
              </span>
            </li>
          ))}
          {members.length + supporters.length === 0 && <li className="px-3 py-2 text-sm text-muted">Este grupo todavía no tiene integrantes.</li>}
        </ul>
      </div>

      <div className="space-y-2">
        <h3 className={label}>Agregar un apoyo de otro grupo</h3>
        <form className="flex flex-wrap gap-2" aria-label="Buscar apoyo por nombre" onSubmit={(e) => { e.preventDefault(); search(); }}>
          <input aria-label="Nombre de la persona" className={`${input} min-w-48 flex-1`} placeholder="Busca por nombre (déjalo vacío para ver todas)" value={query} maxLength={60} onChange={(e) => setQuery(e.target.value)} />
          <button type="submit" className={btn} disabled={busy}>Buscar</button>
        </form>
        {found && (found.length === 0
          ? <p className="text-sm text-muted">No hay personas disponibles con ese nombre: tienen que ser voluntarios o supervisores de otros grupos de la sede, sin otro servicio a esa hora.</p>
          : (
            <ul className="divide-y divide-line rounded-lg border border-line" aria-label="Resultados">
              {found.map((c) => (
                <li key={c.userId} className="flex flex-wrap items-center gap-2 px-3 py-2">
                  <span className="font-semibold">{c.name}</span>
                  <span className="text-xs text-muted">{GROUP_ROLE_LABEL[c.role]} · {c.groupName}</span>
                  <button type="button" className={`${btnPrimary} ml-auto`} disabled={busy} aria-label={`Agregar a ${c.name} como apoyo`} onClick={() => run(async () => {
                    await addSupporter(sb, event.id, c.userId);
                    setFound((f) => (f ?? []).filter((x) => x.userId !== c.userId));
                    return `${c.name} quedó como apoyo de este servicio.`;
                  })}>Agregar como apoyo</button>
                </li>
              ))}
            </ul>
          ))}
      </div>

      <div className="space-y-3 border-t border-line pt-4">
        <h3 className={label}>Solicitud de apoyo</h3>
        {request ? (
          <>
            <p className="text-sm">
              Pides <strong>{request.needed}</strong> {request.needed === 1 ? "persona" : "personas"}; ya {request.filled === 1 ? "hay" : "hay"} <strong>{request.filled}</strong> y {missing > 0 ? <>faltan <strong>{missing}</strong>.</> : "está completa."}
              {request.note ? ` «${request.note}»` : ""}
            </p>
            {request.positionIds.length > 0 && <p className="text-sm text-muted">Posiciones que faltan: {request.positionIds.map(posName).join(" · ")}</p>}
            <p className="text-xs text-muted">Las personas que pueden apoyar la ven al entrar a la aplicación y se postulan; tú apruebas o rechazas.</p>
            {applications.length === 0 ? <p className="text-sm text-muted">Todavía no hay postulaciones.</p> : (
              <ul className="divide-y divide-line rounded-lg border border-line" aria-label="Postulaciones">
                {applications.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center gap-2 px-3 py-2" aria-label={`Postulación de ${a.name}`}>
                    <span className="font-semibold">{a.name}</span>
                    <span className="text-xs text-muted">{GROUP_ROLE_LABEL[a.role] ?? a.role}{a.groupName ? ` · ${a.groupName}` : ""}</span>
                    <span className="rounded-full border border-line px-2 py-0.5 text-xs font-bold">{STATUS_TEXT[a.status]}</span>
                    {a.status === "pendiente" && (
                      <span className="ml-auto flex gap-2">
                        <button type="button" className={btnPrimary} disabled={busy} aria-label={`Aprobar a ${a.name}`} onClick={() => run(() => decideApplication(sb, a.id, true))}>Aprobar</button>
                        <button type="button" className={btn} disabled={busy} aria-label={`Rechazar a ${a.name}`} onClick={() => run(() => decideApplication(sb, a.id, false))}>Rechazar</button>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <button type="button" className={btnDanger} disabled={busy} onClick={() => { if (window.confirm("¿Cancelar la solicitud de apoyo? Las postulaciones pendientes se rechazan.")) run(() => cancelSupportRequest(sb, request.id)); }}>Cancelar solicitud</button>
          </>
        ) : (
          <form className="space-y-3" aria-label="Pedir apoyo" onSubmit={(e) => {
            e.preventDefault();
            run(async () => { await createSupportRequest(sb, event.id, Number(form.needed), form.note, form.positions); setForm({ needed: "1", note: "", positions: [] }); return "Solicitud publicada: las personas que pueden apoyar ya la ven."; });
          }}>
            <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
              <div><label className={label} htmlFor="sr-needed">Personas que faltan</label><input id="sr-needed" type="number" min={1} max={50} className={input} value={form.needed} onChange={(e) => setForm({ ...form, needed: e.target.value })} required /></div>
              <div><label className={label} htmlFor="sr-note">Nota (opcional)</label><input id="sr-note" className={input} maxLength={300} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Por ejemplo: llegar 30 minutos antes" /></div>
            </div>
            {positions.length > 0 && (
              <fieldset>
                <legend className={label}>Posiciones que faltan (opcional)</legend>
                <div className="grid max-h-48 gap-1 overflow-y-auto rounded-lg border border-line p-2 sm:grid-cols-2">
                  {positions.map((p) => (
                    <label key={p.id} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={form.positions.includes(p.id)} onChange={(e) => setForm({ ...form, positions: e.target.checked ? [...form.positions, p.id] : form.positions.filter((x) => x !== p.id) })} />
                      {p.code} · {p.name}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            <button type="submit" className={btnPrimary} disabled={busy}>Pedir apoyo</button>
          </form>
        )}
      </div>
    </section>
  );
}

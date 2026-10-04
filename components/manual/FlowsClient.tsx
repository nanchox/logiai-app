"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { deleteFlow, saveFlow, saveSteps, type StepInput } from "@/lib/manual/mutations";
import { createClient } from "@/lib/supabase/client";
import { btn, btnDanger, btnPrimary, ErrorText, input, label } from "./ui";

export type FlowItem = { id: string; name: string; description: string; steps: (StepInput & { id: string })[] };
type Loc = { id: string; name: string };
type Draft = { id?: string; name: string; description: string; steps: (StepInput & { tmp: string })[] };

const toDraft = (f?: FlowItem): Draft => ({
  id: f?.id,
  name: f?.name ?? "Cuando se llena el Auditorio principal",
  description: f?.description ?? "",
  steps: (f?.steps ?? []).map((s) => ({ ...s, tmp: s.id })),
});

export function FlowsClient({ siteId, siteSlug, canManage, flows, locations }: { siteId: string; siteSlug: string; canManage: boolean; flows: FlowItem[]; locations: Loc[] }) {
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const locName = new Map(locations.map((l) => [l.id, l.name]));

  return (
    <div className="space-y-5">
      {flows.length === 0 && editingId !== "new" && <p className="rounded-2xl border border-line bg-surface p-5 text-muted">Esta sede todavía no tiene flujos de ubicación.</p>}

      {flows.map((f) =>
        editingId === f.id ? (
          <FlowEditor key={f.id} siteId={siteId} initial={toDraft(f)} locations={locations} sort={0} onDone={() => setEditingId(null)} />
        ) : (
          <article key={f.id} className="rounded-2xl border border-line bg-surface p-5">
            <div className="flex items-start gap-3">
              <h2 className="flex-1 text-xl font-extrabold text-link">{f.name}</h2>
              {canManage && <button type="button" className={btn} onClick={() => setEditingId(f.id)} aria-label={`Editar ${f.name}`}>Editar</button>}
            </div>
            {f.description && <p className="mt-1 whitespace-pre-line text-muted">{f.description}</p>}
            <ol className="mt-4 space-y-3">
              {f.steps.map((s, i) => (
                <li key={s.id} className="flex gap-3">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent font-black text-on-accent" aria-hidden>{i + 1}</span>
                  <div className="min-w-0">
                    <p className="font-bold">{s.title}
                      {s.locationId && locName.has(s.locationId) && (
                        <> · <Link href={`/manual/${siteSlug}/${s.locationId}`}>{locName.get(s.locationId)}</Link></>
                      )}
                    </p>
                    {s.instructions && <p className="whitespace-pre-line text-sm leading-relaxed">{s.instructions}</p>}
                  </div>
                </li>
              ))}
            </ol>
            {f.steps.length === 0 && <p className="mt-3 text-sm text-muted">Este flujo aún no tiene pasos.</p>}
          </article>
        ),
      )}

      {canManage &&
        (editingId === "new" ? (
          <FlowEditor siteId={siteId} initial={toDraft()} locations={locations} sort={flows.length + 1} onDone={() => setEditingId(null)} />
        ) : (
          <button type="button" className={btnPrimary} onClick={() => setEditingId("new")}>＋ Nuevo flujo</button>
        ))}
    </div>
  );
}

function FlowEditor({ siteId, initial, locations, sort, onDone }: { siteId: string; initial: Draft; locations: Loc[]; sort: number; onDone: () => void }) {
  const router = useRouter();
  const sb = createClient();
  const uid = useId();
  const [d, setD] = useState<Draft>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const patch = (i: number, p: Partial<StepInput>) => setD((s) => ({ ...s, steps: s.steps.map((x, j) => (j === i ? { ...x, ...p } : x)) }));
  const move = (i: number, dir: -1 | 1) =>
    setD((s) => {
      const steps = [...s.steps];
      const j = i + dir;
      if (j < 0 || j >= steps.length) return s;
      [steps[i], steps[j]] = [steps[j], steps[i]];
      return { ...s, steps };
    });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const id = await saveFlow(sb, siteId, { name: d.name, description: d.description }, d.id, sort);
      await saveSteps(sb, id, d.steps.map((s) => ({ id: s.id && !s.id.startsWith("new-") ? s.id : undefined, locationId: s.locationId, title: s.title, instructions: s.instructions })));
      router.refresh();
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-4 rounded-2xl border border-accent/70 bg-surface p-5" aria-label={d.id ? "Editar flujo" : "Nuevo flujo"}>
      <div>
        <label className={label} htmlFor={`${uid}-name`}>Nombre del flujo</label>
        <input id={`${uid}-name`} className={input} value={d.name} required onChange={(e) => setD({ ...d, name: e.target.value })} />
      </div>
      <div>
        <label className={label} htmlFor={`${uid}-desc`}>Descripción (opcional)</label>
        <textarea id={`${uid}-desc`} className={`${input} min-h-20`} value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} />
      </div>

      <ol className="space-y-3">
        {d.steps.map((s, i) => (
          <li key={s.tmp} className="space-y-2 rounded-xl border border-line bg-bg p-3">
            <div className="flex items-center gap-2">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent text-sm font-black text-on-accent">{i + 1}</span>
              <input className={input} value={s.title} required placeholder="Título del paso" aria-label={`Título del paso ${i + 1}`} onChange={(e) => patch(i, { title: e.target.value })} />
              <button type="button" className={btn} onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Subir paso ${i + 1}`}>↑</button>
              <button type="button" className={btn} onClick={() => move(i, 1)} disabled={i === d.steps.length - 1} aria-label={`Bajar paso ${i + 1}`}>↓</button>
              <button type="button" className={btnDanger} onClick={() => setD({ ...d, steps: d.steps.filter((_, j) => j !== i) })} aria-label={`Quitar paso ${i + 1}`}>✕</button>
            </div>
            <select className={input} value={s.locationId ?? ""} aria-label={`Espacio del paso ${i + 1}`} onChange={(e) => patch(i, { locationId: e.target.value || null })}>
              <option value="">Sin espacio específico</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <textarea className={`${input} min-h-16`} value={s.instructions} placeholder="Qué hacer en este paso" aria-label={`Indicaciones del paso ${i + 1}`} onChange={(e) => patch(i, { instructions: e.target.value })} />
          </li>
        ))}
      </ol>
      <button type="button" className={btn} onClick={() => setD({ ...d, steps: [...d.steps, { tmp: `new-${crypto.randomUUID()}`, id: `new-${crypto.randomUUID()}`, locationId: null, title: "", instructions: "" }] })}>＋ Agregar paso</button>

      <ErrorText error={error} />
      <div className="flex flex-wrap gap-2">
        <button className={btnPrimary} disabled={busy}>{busy ? "Guardando…" : "Guardar flujo"}</button>
        <button type="button" className={btn} onClick={onDone} disabled={busy}>Cancelar</button>
        {d.id && (
          <button type="button" className={btnDanger} disabled={busy} onClick={async () => {
            if (!window.confirm(`¿Eliminar el flujo "${d.name}" con todos sus pasos?`)) return;
            setBusy(true);
            try { await deleteFlow(sb, d.id!); router.refresh(); onDone(); } catch (err) { setError((err as Error).message); setBusy(false); }
          }}>Eliminar flujo</button>
        )}
      </div>
    </form>
  );
}

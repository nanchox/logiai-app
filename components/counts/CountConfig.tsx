"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { btn, btnDanger, btnPrimary, ErrorText, input, label } from "@/components/manual/ui";
import { DAY_LABEL, LOCATION_KIND_LABEL } from "@/lib/labels";
import { createClient } from "@/lib/supabase/client";
import { deleteGuide, saveCapacity, saveGuideNote, uploadGuide } from "@/lib/counts/mutations";
import type { CountGuide, CountLocation } from "@/lib/counts/types";

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

export function CountConfig({ sites, locations, guides }: { sites: Site[]; locations: CountLocation[]; guides: CountGuide[] }) {
  if (!sites.length) return <p className="text-muted">No hay sedes disponibles.</p>;
  return (
    <div className="space-y-8">
      {sites.map((s) => (
        <section key={s.id} aria-label={s.name} className="space-y-4">
          <h2 className="text-xl font-extrabold">{s.name}</h2>
          <Capacity site={s} locations={locations.filter((l) => l.siteId === s.id)} />
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

function Guides({ site, guides }: { site: Site; guides: CountGuide[] }) {
  return (
    <div className="space-y-3 rounded-2xl border border-line bg-surface p-5">
      <div>
        <h3 className="text-lg font-extrabold">Guía de conteo (imagen)</h3>
        <p className="text-sm text-muted">Una imagen por día de la semana que indica cómo y dónde contar en cada entrada. Se repite cada semana hasta que la reemplaces. La ve el grupo que sirve ese día.</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
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
    <article aria-label={`Guía del ${title} en ${site.name}`} className="space-y-2 rounded-xl border border-line bg-bg p-3">
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

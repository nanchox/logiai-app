"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { LOCATION_KIND_LABEL } from "@/lib/labels";
import { deleteLocation, saveLocation } from "@/lib/manual/mutations";
import { createClient } from "@/lib/supabase/client";
import { btn, btnDanger, btnPrimary, ErrorText, input, label } from "./ui";

type Loc = { id: string; name: string; kind: string; manualUrl: string | null };

function Fields({ value, onChange }: { value: { name: string; kind: string; manualUrl: string }; onChange: (v: { name: string; kind: string; manualUrl: string }) => void }) {
  const id = useId();
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <label className={label} htmlFor={`${id}-n`}>Nombre</label>
        <input id={`${id}-n`} className={input} value={value.name} required placeholder="Auditorio principal" onChange={(e) => onChange({ ...value, name: e.target.value })} />
      </div>
      <div>
        <label className={label} htmlFor={`${id}-k`}>Tipo</label>
        <select id={`${id}-k`} className={input} value={value.kind} onChange={(e) => onChange({ ...value, kind: e.target.value })}>
          {Object.entries(LOCATION_KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </div>
      <div className="sm:col-span-2">
        <label className={label} htmlFor={`${id}-u`}>Enlace al manual en presentación (opcional)</label>
        <input id={`${id}-u`} className={input} value={value.manualUrl} inputMode="url" placeholder="https://docs.google.com/presentation/…" onChange={(e) => onChange({ ...value, manualUrl: e.target.value })} />
      </div>
    </div>
  );
}

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

/** Herramientas bajo la tarjeta de un espacio: editar y eliminar. */
export function LocationTools({ siteId, location }: { siteId: string; location: Loc }) {
  const sb = createClient();
  const { busy, error, run } = useAction();
  const [v, setV] = useState({ name: location.name, kind: location.kind, manualUrl: location.manualUrl ?? "" });
  return (
    <details className="mt-3 border-t border-line pt-2">
      <summary className="cursor-pointer text-sm font-semibold">Editar espacio</summary>
      <form className="mt-3 space-y-3" aria-label={`Editar ${location.name}`} onSubmit={(e) => { e.preventDefault(); run(() => saveLocation(sb, siteId, v, location.id)); }}>
        <Fields value={v} onChange={setV} />
        <ErrorText error={error} />
        <div className="flex gap-2">
          <button className={btnPrimary} disabled={busy}>Guardar</button>
          <button type="button" className={btnDanger} disabled={busy} onClick={() => {
            if (window.confirm(`¿Eliminar "${location.name}" con sus mapas, zonas, posiciones, fotos y videos? No se puede deshacer.`)) run(() => deleteLocation(sb, location.id));
          }}>Eliminar</button>
        </div>
      </form>
    </details>
  );
}

export function NewLocation({ siteId, nextSort }: { siteId: string; nextSort: number }) {
  const sb = createClient();
  const { busy, error, run } = useAction();
  const [v, setV] = useState({ name: "", kind: "salon", manualUrl: "" });
  return (
    <details className="rounded-2xl border border-dashed border-line p-4">
      <summary className="cursor-pointer font-bold">＋ Agregar espacio</summary>
      <form className="mt-3 space-y-3" aria-label="Nuevo espacio" onSubmit={(e) => { e.preventDefault(); run(async () => { await saveLocation(sb, siteId, v, undefined, nextSort); setV({ name: "", kind: "salon", manualUrl: "" }); }); }}>
        <Fields value={v} onChange={setV} />
        <ErrorText error={error} />
        <button className={btn} disabled={busy}>Agregar espacio</button>
      </form>
    </details>
  );
}

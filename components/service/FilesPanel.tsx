"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { btnDanger, ErrorText, label } from "@/components/manual/ui";
import { createClient } from "@/lib/supabase/client";
import { deleteScheduleFile, FILE_ACCEPT, uploadScheduleFile } from "@/lib/service/mutations";
import type { PlanFile, ServiceEvent } from "@/lib/service/types";

const size = (n: number | null) => (n ? (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`) : "");

/** Programación cargada como archivo (PDF, Excel o imagen): la sube quien planifica y la ve todo el grupo. */
export function FilesPanel({ event, files, canPlan }: { event: ServiceEvent; files: PlanFile[]; canPlan: boolean }) {
  const sb = useMemo(() => createClient(), []);
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try { await fn(); router.refresh(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); if (input.current) input.current.value = ""; }
  };
  if (!canPlan && !files.length) return null;

  return (
    <section aria-label="Programación en archivo" className="space-y-3 rounded-2xl border border-line bg-surface p-5">
      <div>
        <h2 className="text-lg font-extrabold">Programación en archivo</h2>
        <p className="text-sm text-muted">PDF, Excel o imagen con las posiciones programadas para este servicio. Puedes usarla en lugar de la planeación de arriba, o junto con ella.</p>
      </div>
      <ErrorText error={error} />
      {files.length > 0 && (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {files.map((f) => (
            <li key={f.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
              {f.url ? <a href={f.url} target="_blank" rel="noreferrer" className="flex-1 break-all font-semibold">{f.name}</a> : <span className="flex-1 break-all">{f.name}</span>}
              <span className="text-xs text-muted">{size(f.size)}</span>
              {canPlan && <button type="button" className={btnDanger} disabled={busy} aria-label={`Quitar ${f.name}`} onClick={() => { if (window.confirm(`¿Quitar «${f.name}»?`)) run(() => deleteScheduleFile(sb, f)); }}>Quitar</button>}
            </li>
          ))}
        </ul>
      )}
      {canPlan && (
        <div>
          <label className={label} htmlFor="sf-file">Subir archivo (máx. 5 archivos de 10 MB)</label>
          <div className="flex flex-wrap gap-2">
            <input ref={input} id="sf-file" type="file" accept={FILE_ACCEPT} disabled={busy} className="max-w-full text-sm" onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) run(() => uploadScheduleFile(sb, event.siteSlug, event.id, file));
            }} />
            {busy && <span className="text-sm text-muted">Subiendo…</span>}
          </div>
        </div>
      )}
    </section>
  );
}

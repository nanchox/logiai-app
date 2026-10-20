"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { btn, btnPrimary, ErrorText } from "@/components/manual/ui";
import { serviceLabel } from "@/lib/labels";
import { formatServiceDate } from "@/lib/service/dates";
import { createClient } from "@/lib/supabase/client";
import { applyToRequest, withdrawApplication } from "@/lib/support/mutations";
import type { OpenRequest } from "@/lib/support/types";

/** Solicitudes de apoyo de otros grupos: la persona se postula y el grupo que pide decide. */
export function SupportRequests({ requests, compact }: { requests: OpenRequest[]; compact?: boolean }) {
  const sb = useMemo(() => createClient(), []);
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (id: string, fn: () => Promise<void>) => {
    setBusy(id);
    setError(null);
    try { await fn(); router.refresh(); } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  };
  if (!requests.length) return null;

  return (
    <div className="space-y-3">
      <ErrorText error={error} />
      <ul className="space-y-3">
        {requests.map((r) => {
          const missing = Math.max(0, r.needed - r.filled);
          return (
            <li key={r.requestId} className="rounded-2xl border border-accent bg-surface p-4" aria-label={`Solicitud de apoyo de ${r.groupName}`}>
              <p className="font-bold">{r.groupName} necesita apoyo</p>
              <p className="text-sm text-muted">
                {formatServiceDate(r.date)} · {serviceLabel(r.day, r.shift)} · {r.siteName}{r.startTime ? ` · ${r.startTime.slice(0, 5)}` : ""}
              </p>
              <p className="mt-1 text-sm">Faltan <strong>{missing}</strong> de {r.needed}.{r.note ? ` ${r.note}` : ""}</p>
              {!compact && r.positions.length > 0 && <p className="mt-1 text-sm text-muted">Posiciones que faltan: {r.positions.join(" · ")}</p>}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {r.myStatus === "pendiente" && (
                  <>
                    <span className="rounded-full border border-line px-2.5 py-0.5 text-xs font-bold">Postulación enviada: esperando respuesta</span>
                    <button type="button" className={btn} disabled={busy === r.requestId} onClick={() => run(r.requestId, () => withdrawApplication(sb, r.applicationId!))}>Retirar postulación</button>
                  </>
                )}
                {r.myStatus === "aprobada" && <span className="rounded-full bg-primary px-2.5 py-0.5 text-xs font-bold text-on-primary">Aprobada: ya eres apoyo de este servicio</span>}
                {r.myStatus === null && (
                  <button type="button" className={btnPrimary} disabled={busy === r.requestId} onClick={() => run(r.requestId, () => applyToRequest(sb, r.requestId))}>Quiero apoyar</button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {compact && <p className="text-sm"><Link href="/servicio">Ver todas en Mi servicio →</Link></p>}
    </div>
  );
}

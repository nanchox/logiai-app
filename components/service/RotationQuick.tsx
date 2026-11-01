"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { btn, btnPrimary, ErrorText } from "@/components/manual/ui";
import { serviceLabel } from "@/lib/labels";
import { createClient } from "@/lib/supabase/client";
import { addDays, formatServiceDateShort } from "@/lib/service/dates";
import { describeGenerate, generateEvents } from "@/lib/service/mutations";

export type QuickSlot = { id: string; siteName: string; day: string; shift: string; groups: number; last: string | null };

/** Generar más rotación sin salir de Mi servicio: continúa desde la última fecha ya generada de cada horario. */
export function RotationQuick({ slots, today }: { slots: QuickSlot[]; today: string }) {
  const sb = useMemo(() => createClient(), []);
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, string>>({});
  const [weeks, setWeeks] = useState(12);

  async function more(s: QuickSlot) {
    setBusy(s.id); setError(null);
    try {
      const from = s.last && s.last >= today ? addDays(s.last, 1) : today;
      const r = await generateEvents(sb, s.id, from, addDays(from, weeks * 7 - 1));
      setDone((d) => ({ ...d, [s.id]: describeGenerate(r) }));
      router.refresh();
    } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  }

  return (
    <section aria-label="Generar rotación" className="space-y-3 rounded-2xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1">
          <h2 className="text-lg font-extrabold">Rotación</h2>
          <p className="text-sm text-muted">Sigue generando fechas desde donde quedaste. Una fecha cancelada pierde su turno y la rotación continúa.</p>
        </div>
        <label className="text-sm font-semibold" htmlFor="rq-weeks">Semanas a generar
          <select id="rq-weeks" className="ml-2 rounded-lg border border-line bg-bg px-2 py-1.5" value={weeks} onChange={(e) => setWeeks(Number(e.target.value))}>
            {[4, 8, 12, 26, 52].map((w) => <option key={w} value={w}>{w}</option>)}
          </select>
        </label>
      </div>
      <ErrorText error={error} />
      {slots.length === 0 ? <p className="text-sm text-muted">No hay horarios en tus sedes todavía: créalos en Grupos y horarios.</p> : (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {slots.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-3 px-3 py-2" aria-label={`Rotación ${s.siteName} ${serviceLabel(s.day, s.shift)}`}>
              <div className="min-w-48 flex-1">
                <p className="font-semibold">{s.siteName} · {serviceLabel(s.day, s.shift)}</p>
                <p className="text-sm text-muted">
                  {s.groups === 0 ? "Este horario no tiene grupos" : s.last ? `Generada hasta el ${formatServiceDateShort(s.last)}` : "Todavía no hay fechas generadas"}
                </p>
                {done[s.id] && <p role="status" className="text-sm">{done[s.id]}</p>}
              </div>
              <button type="button" className={btnPrimary} disabled={busy === s.id || s.groups === 0} aria-label={`Generar ${weeks} semanas más de ${s.siteName} ${serviceLabel(s.day, s.shift)}`} onClick={() => more(s)}>
                {s.last && s.last >= today ? `Generar ${weeks} semanas más` : `Generar ${weeks} semanas`}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-sm"><Link href="/personas/rotacion" className={`${btn} inline-block no-underline`}>Rotación completa: orden de los grupos, cancelaciones y servicios especiales →</Link></p>
    </section>
  );
}

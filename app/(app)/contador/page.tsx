import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { loadMyCounterEntrances } from "@/lib/counter/load";
import { formatServiceDate } from "@/lib/service/dates";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Contador de entradas" };

export default async function CounterListPage() {
  await requireUser();
  const supabase = await createClient();
  const entries = await loadMyCounterEntrances(supabase);

  return (
    <main className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold">Contador de entradas</h1>
        <p className="mt-1 text-muted">Cuenta a las personas que entran con un botón grande. Solo el día del servicio y en la entrada de tu posición de conteo.</p>
      </div>
      {entries.length === 0 ? (
        <p className="rounded-2xl border border-line bg-surface p-5 text-muted">Hoy no tienes una entrada para contar. Si te asignaron una posición de conteo, aparecerá aquí cuando se publique la planeación del servicio.</p>
      ) : (
        <ul className="space-y-3" aria-label="Entradas para contar">
          {entries.map((e) => (
            <li key={`${e.eventId}-${e.entranceId}`}>
              <Link href={`/contador/${e.eventId}/${e.entranceId}`} className="block rounded-2xl border-2 border-accent bg-surface p-4 no-underline hover:brightness-105">
                <span className="block text-lg font-extrabold text-fg">{e.entranceName}</span>
                <span className="block text-sm text-muted">{e.locationName} · {e.siteName}{e.groupName ? ` · ${e.groupName}` : ""}</span>
                <span className="block text-sm text-muted">{formatServiceDate(e.date)}{e.note ? ` · ${e.note}` : ""}</span>
                <span className="mt-2 inline-block rounded-full bg-badge px-2.5 py-0.5 text-xs font-bold text-on-badge">{e.assigned ? "Tu posición de conteo" : "Por planificar el servicio"}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

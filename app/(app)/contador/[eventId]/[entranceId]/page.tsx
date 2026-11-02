import type { Metadata } from "next";
import Link from "next/link";
import { EntranceCounter } from "@/components/counter/EntranceCounter";
import { requireUser } from "@/lib/auth";
import { loadCounterState } from "@/lib/counter/load";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Contador" };

export default async function CounterPage({ params }: PageProps<"/contador/[eventId]/[entranceId]">) {
  const { eventId, entranceId } = await params;
  await requireUser();
  const uuid = /^[0-9a-f-]{36}$/i;
  const state = uuid.test(eventId) && uuid.test(entranceId) ? await loadCounterState(await createClient(), eventId, entranceId) : null;

  if (!state) {
    return (
      <main className="space-y-3">
        <h1 className="text-2xl font-extrabold">No puedes contar aquí</h1>
        <p className="text-muted">Solo se cuenta el día del servicio, en la entrada de tu posición de conteo (o si planificas el servicio).</p>
        <p><Link href="/contador">← Contador de entradas</Link></p>
      </main>
    );
  }
  return <EntranceCounter eventId={eventId} entranceId={entranceId} initial={state} backHref="/contador" />;
}

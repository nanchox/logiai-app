import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CountConfig } from "@/components/counts/CountConfig";
import { requireUser } from "@/lib/auth";
import { loadCountLocations, loadEntranceQuotas, loadEntrances, loadGuides, loadReservationDefaults, loadReservationZones } from "@/lib/counts/load";
import { loadSlots } from "@/lib/people/load";
import { loadSlotMeetings } from "@/lib/service/load";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Capacidad y guías de conteo" };

export default async function CountConfigPage() {
  const user = await requireUser();
  if (!user.canManageGroups) redirect("/conteos");

  const supabase = await createClient();
  const [{ data: sites }, locations, guides, zones, defaults, entrances, quotas, slots, meetings] = await Promise.all([
    supabase.from("sites").select("id, slug, name").order("sort"),
    loadCountLocations(supabase),
    loadGuides(supabase),
    loadReservationZones(supabase),
    loadReservationDefaults(supabase),
    loadEntrances(supabase),
    loadEntranceQuotas(supabase),
    loadSlots(supabase),
    loadSlotMeetings(supabase),
  ]);
  const mine = (sites ?? []).filter((s) => user.isAdmin || user.isHead || user.leaderSites.some((l) => l.id === s.id));

  return (
    <main className="space-y-6">
      <div>
        <p className="text-sm"><Link href="/conteos">← Conteos</Link></p>
        <h1 className="mt-1 text-2xl font-extrabold">Capacidad y guías de conteo</h1>
        <p className="mt-1 text-muted">Registra cuántas sillas tiene cada ubicación, sus entradas con el cupo de cada reunión, las reservas predeterminadas de cada zona y, por día de la semana, la imagen que indica cómo contar en cada entrada.</p>
      </div>
      <CountConfig sites={mine} locations={locations} guides={guides} zones={zones} defaults={defaults} entrances={entrances} quotas={quotas} slots={slots} meetings={meetings} />
    </main>
  );
}

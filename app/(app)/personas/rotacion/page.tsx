import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PeopleNav } from "@/components/people/PeopleNav";
import { RotationAdmin } from "@/components/service/RotationAdmin";
import { requireUser } from "@/lib/auth";
import { loadSites, loadSlots } from "@/lib/people/load";
import { addDays, todayCo } from "@/lib/service/dates";
import { loadCancellations, loadEvents, loadRotationGroups } from "@/lib/service/load";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Rotación" };

export default async function RotationPage() {
  const user = await requireUser();
  if (!user.canManageGroups) redirect(user.canManagePeople ? "/personas" : "/");

  const supabase = await createClient();
  const today = todayCo();
  const [sites, slots, groups, events, cancellations] = await Promise.all([
    loadSites(supabase), loadSlots(supabase), loadRotationGroups(supabase),
    loadEvents(supabase, { from: today, until: addDays(today, 120), limit: 600 }),
    loadCancellations(supabase, today),
  ]);

  return (
    <main>
      <h1 className="mb-1 text-2xl font-extrabold">Rotación</h1>
      <p className="mb-4 text-muted">Cada horario rota sus grupos semana a semana, de forma independiente a las demás sedes. Genera las fechas, cancela las que no haya servicio y ajusta casos especiales.</p>
      <PeopleNav current="rotacion" canManageGroups canManageLeaders={user.isAdmin || user.isHead} />
      <RotationAdmin sites={sites} slots={slots} groups={groups} events={events} cancellations={cancellations} today={today} canAllSites={user.isAdmin || user.isHead} />
    </main>
  );
}

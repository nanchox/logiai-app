import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PeopleNav } from "@/components/people/PeopleNav";
import { ReserversAdmin } from "@/components/people/ReserversAdmin";
import { requireUser } from "@/lib/auth";
import { loadReservers, loadSites } from "@/lib/people/load";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Reservas de puestos" };

export default async function ReserversPage() {
  const user = await requireUser();
  if (!user.canManageGroups) redirect(user.canManagePeople ? "/personas" : "/");

  const supabase = await createClient();
  const all = await loadSites(supabase);
  const sites = all.filter((s) => user.isAdmin || user.isHead || user.leaderSites.some((l) => l.id === s.id));
  const { reservers, pending } = await loadReservers(supabase, sites);

  return (
    <main>
      <h1 className="mb-1 text-2xl font-extrabold">Reservas de puestos</h1>
      <p className="mb-4 text-muted">Quién puede registrar reservas de puestos en cada sede. Quien tiene solo este rol entra y únicamente llena el cuadro de reservas.</p>
      <PeopleNav current="reservas" canManageGroups canManageLeaders={user.isAdmin || user.isHead} />
      <ReserversAdmin viewerId={user.id} sites={sites} reservers={reservers} pending={pending} />
    </main>
  );
}

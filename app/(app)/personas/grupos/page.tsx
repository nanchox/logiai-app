import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { GroupsAdmin } from "@/components/people/GroupsAdmin";
import { PeopleNav } from "@/components/people/PeopleNav";
import { requireUser } from "@/lib/auth";
import { loadGroups, loadSites, loadSlots } from "@/lib/people/load";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Grupos y horarios" };

export default async function GroupsPage() {
  const user = await requireUser();
  if (!user.canManageGroups) redirect(user.canManagePeople ? "/personas" : "/");

  const supabase = await createClient();
  const [sites, slots, groups] = await Promise.all([loadSites(supabase), loadSlots(supabase), loadGroups(supabase)]);

  return (
    <main>
      <h1 className="mb-1 text-2xl font-extrabold">Grupos y horarios</h1>
      <p className="mb-4 text-muted">Cada grupo pertenece a un horario de una sede (día y franja). Las personas se agregan a un grupo desde Integrantes.</p>
      <PeopleNav current="grupos" canManageGroups canManageLeaders={user.isAdmin || user.isHead} />
      <GroupsAdmin sites={sites} slots={slots} groups={groups} />
    </main>
  );
}

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LeadersAdmin } from "@/components/people/LeadersAdmin";
import { PeopleNav } from "@/components/people/PeopleNav";
import { requireUser } from "@/lib/auth";
import { loadLeaders, loadSites } from "@/lib/people/load";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Líderes y administración" };

export default async function LeadersPage() {
  const user = await requireUser();
  if (!user.isAdmin && !user.isHead) redirect(user.canManagePeople ? "/personas" : "/");

  const supabase = await createClient();
  const sites = await loadSites(supabase);
  const { leaders, admins, pending } = await loadLeaders(supabase, sites);

  return (
    <main>
      <h1 className="mb-1 text-2xl font-extrabold">Líderes y administración</h1>
      <p className="mb-4 text-muted">Quién acompaña a cada sede y quién administra la aplicación.</p>
      <PeopleNav current="lideres" canManageGroups canManageLeaders />
      <LeadersAdmin viewerId={user.id} isAdmin={user.isAdmin} sites={sites} leaders={leaders} admins={admins} pending={pending} />
    </main>
  );
}

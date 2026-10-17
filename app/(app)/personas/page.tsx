import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PeopleClient } from "@/components/people/PeopleClient";
import { PeopleNav } from "@/components/people/PeopleNav";
import { requireUser } from "@/lib/auth";
import { loadGroups, loadInvites, loadMembers, viewerOf } from "@/lib/people/load";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Personas" };

export default async function PeoplePage({ searchParams }: PageProps<"/personas">) {
  const user = await requireUser();
  const viewer = viewerOf(user);
  if (!viewer) redirect("/");

  const supabase = await createClient();
  const groups = await loadGroups(supabase);
  const { grupo } = await searchParams;
  const selected = groups.find((g) => g.id === grupo) ?? groups.find((g) => g.id === viewer.groupId) ?? groups[0];
  const [members, invites] = selected
    ? await Promise.all([loadMembers(supabase, selected.id), loadInvites(supabase, selected.id)])
    : [[], []];

  return (
    <main>
      <h1 className="mb-1 text-2xl font-extrabold">Personas</h1>
      <p className="mb-4 text-muted">Agrega correos para que puedan entrar con Google, y administra a quienes ya están.</p>
      <PeopleNav current="integrantes" canManageGroups={user.canManageGroups} canManageLeaders={user.isAdmin || user.isHead} />
      {selected ? (
        <PeopleClient viewer={viewer} groups={groups} selectedId={selected.id} members={members} invites={invites} />
      ) : (
        <p className="rounded-2xl border border-line bg-surface p-5 text-muted">
          Todavía no hay grupos.{" "}
          {user.canManageGroups ? <>Créalos en <Link href="/personas/grupos">Grupos y horarios</Link>.</> : "Pide a tu líder de sede que los cree."}
        </p>
      )}
    </main>
  );
}

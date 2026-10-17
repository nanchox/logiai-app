"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { deleteInvitation } from "@/lib/people/mutations";
import { ROLE_LABEL } from "@/lib/people/labels";
import { canManageMember, type GroupItem, type InviteItem, type MemberItem, type Viewer } from "@/lib/people/types";
import { btn, btnDanger, ErrorText, input } from "@/components/manual/ui";
import { AddPeopleForm } from "./AddPeopleForm";
import { GroupSelect } from "./GroupSelect";
import { MemberDialog } from "./MemberDialog";

type Props = { viewer: Viewer; groups: GroupItem[]; selectedId: string; members: MemberItem[]; invites: InviteItem[] };

const initials = (name: string) => name.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");

export function PeopleClient({ viewer, groups, selectedId, members, invites }: Props) {
  const router = useRouter();
  const sb = useMemo(() => createClient(), []);
  const [editing, setEditing] = useState<MemberItem | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const group = groups.find((g) => g.id === selectedId);
  const refresh = () => router.refresh();
  const go = (id: string) => router.push(`/personas?grupo=${id}`);

  const q = query.trim().toLowerCase();
  const shown = q ? members.filter((m) => m.name.toLowerCase().includes(q) || m.email?.toLowerCase().includes(q)) : members;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-64 flex-1">
          <label htmlFor="grp" className="mb-1 block text-xs font-bold uppercase tracking-wider text-muted">Grupo</label>
          <GroupSelect id="grp" label="Grupo" groups={groups} value={selectedId} onChange={go} showCount />
        </div>
        {group && <p className="pb-2 text-sm text-muted">{group.siteName} · {group.memberCount} integrante{group.memberCount === 1 ? "" : "s"}</p>}
      </div>

      <AddPeopleForm key={selectedId} viewer={viewer} groups={groups} initialGroupId={selectedId} onDone={(id) => (id === selectedId ? refresh() : go(id))} />

      <section aria-label="Integrantes">
        <div className="mb-2 flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-extrabold">Integrantes</h2>
          {members.length > 8 && <input className={`${input} max-w-60`} placeholder="Buscar por nombre o correo" aria-label="Buscar integrante" value={query} onChange={(e) => setQuery(e.target.value)} />}
        </div>
        {shown.length === 0 ? (
          <p className="rounded-2xl border border-line bg-surface p-5 text-muted">{members.length ? "Nadie coincide con la búsqueda." : "Este grupo todavía no tiene integrantes."}</p>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {shown.map((m) => (
              <li key={m.userId} className="flex flex-wrap items-center gap-3 p-3">
                <span aria-hidden className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-black ${m.role === "coordinador" ? "bg-bronze text-on-bronze" : "bg-bg"}`}>{initials(m.name)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{m.name}{m.userId === viewer.userId && <span className="ml-2 text-xs text-muted">(tú)</span>}</span>
                  <span className="block truncate text-sm text-muted">{m.email ?? "Correo privado"}</span>
                </span>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${m.role === "coordinador" ? "bg-bronze text-on-bronze" : "border border-line"}`}>{ROLE_LABEL[m.role]}</span>
                {group && canManageMember(viewer, m, group) && (
                  <button type="button" className={btn} onClick={() => setEditing(m)} aria-label={`Administrar a ${m.name}`}>Administrar</button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Invitaciones pendientes">
        <h2 className="mb-2 text-lg font-extrabold">Invitaciones pendientes ({invites.length})</h2>
        <p className="mb-2 text-sm text-muted">Correos que ya pueden entrar con Google pero todavía no lo han hecho.</p>
        {invites.length === 0 ? (
          <p className="rounded-2xl border border-line bg-surface p-5 text-muted">No hay invitaciones pendientes en este grupo.</p>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {invites.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-3 p-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{i.email}</span>
                  <span className="block text-sm text-muted">{ROLE_LABEL[i.role]} · {new Date(i.createdAt).toLocaleDateString("es")}</span>
                </span>
                <button type="button" className={btnDanger} aria-label={`Quitar la invitación de ${i.email}`} onClick={async () => {
                  setError(null);
                  try { await deleteInvitation(sb, i.id); refresh(); } catch (e) { setError((e as Error).message); }
                }}>Quitar</button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-2"><ErrorText error={error} /></div>
      </section>

      <MemberDialog member={editing} viewer={viewer} groups={groups} onClose={() => setEditing(null)} onDone={refresh} />
    </div>
  );
}

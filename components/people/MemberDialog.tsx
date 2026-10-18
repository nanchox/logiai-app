"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { deletePerson, updateMember } from "@/lib/people/mutations";
import { ROLE_LABEL } from "@/lib/people/labels";
import { assignableRoles, destinationGroups, type GroupItem, type GroupRole, type MemberItem, type Viewer } from "@/lib/people/types";
import { btnDanger, btnPrimary, ErrorText, input, label, ModalDialog } from "@/components/manual/ui";
import { GroupSelect } from "./GroupSelect";

type Props = { member: MemberItem | null; viewer: Viewer; groups: GroupItem[]; onClose: () => void; onDone: () => void };

export function MemberDialog(props: Props) {
  return (
    <ModalDialog open={!!props.member} onClose={props.onClose} size="lg" title="Administrar persona">
      {props.member && <Form key={props.member.userId} {...props} member={props.member} />}
    </ModalDialog>
  );
}

function Form({ member, viewer, groups, onClose, onDone }: Props & { member: MemberItem }) {
  const sb = useMemo(() => createClient(), []);
  const destinations = useMemo(() => destinationGroups(viewer, groups), [viewer, groups]);
  const current = groups.find((g) => g.id === member.groupId);
  const [groupId, setGroupId] = useState(member.groupId);
  const [role, setRole] = useState<GroupRole>(member.role);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const target = groups.find((g) => g.id === groupId) ?? current;
  const roles = target ? assignableRoles(viewer, target) : [];
  const effectiveRole = roles.includes(role) ? role : (roles.at(-1) ?? member.role);
  const changed = groupId !== member.groupId || effectiveRole !== member.role;

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try { await fn(); onDone(); onClose(); } catch (e) { setError((e as Error).message); setBusy(false); }
  }

  return (
    <div className="flex max-h-[90vh] flex-col">
      <div className="space-y-5 overflow-y-auto p-6">
        <div>
          <h2 className="text-xl font-extrabold text-link">{member.name}</h2>
          <p className="text-sm text-muted">{member.email ?? "Correo privado"} · {ROLE_LABEL[member.role]}{current ? ` · ${current.siteName}` : ""}</p>
        </div>

        <form className="space-y-3" aria-label="Mover o cambiar rol" onSubmit={(e) => { e.preventDefault(); run(() => updateMember(sb, member.userId, { groupId, role: effectiveRole })); }}>
          <h3 className="text-sm font-extrabold">Mover o cambiar de rol</h3>
          {destinations.length > 1 && (
            <div>
              <label className={label} htmlFor="md-group">Grupo (horario y sede)</label>
              <GroupSelect id="md-group" label="Grupo de destino" groups={destinations} value={groupId} onChange={setGroupId} />
            </div>
          )}
          <div>
            <label className={label} htmlFor="md-role">Rol</label>
            <select id="md-role" className={input} value={effectiveRole} onChange={(e) => setRole(e.target.value as GroupRole)}>
              {roles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </select>
          </div>
          <p className="text-xs text-muted">Una persona está siempre en un solo grupo: al moverla deja el anterior.</p>
          <ErrorText error={error} />
          <button className={btnPrimary} disabled={busy || !changed}>{busy ? "Guardando…" : "Guardar cambios"}</button>
        </form>

        <section className="space-y-2 border-t border-line pt-4">
          <h3 className="text-sm font-extrabold text-danger">Eliminar de la aplicación</h3>
          <p className="text-sm text-muted">Pierde el acceso y se borra su cuenta. Para que vuelva a entrar hay que invitarla de nuevo.</p>
          <button type="button" className={btnDanger} disabled={busy} onClick={() => {
            if (window.confirm(`¿Eliminar a ${member.name} de la aplicación? Perderá el acceso y tendrás que invitarla de nuevo para que vuelva.`)) run(() => deletePerson(sb, member.userId));
          }}>Eliminar a {member.name.split(" ")[0]}</button>
        </section>
      </div>
      <button type="button" onClick={onClose} className="shrink-0 bg-deep p-4 font-bold text-white">CERRAR</button>
    </div>
  );
}

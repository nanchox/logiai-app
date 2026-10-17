"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { inviteEmails, type InviteResult } from "@/lib/people/mutations";
import { ROLE_LABEL } from "@/lib/people/labels";
import { assignableRoles, type GroupItem, type GroupRole, type Viewer } from "@/lib/people/types";
import { btnPrimary, ErrorText, input, label } from "@/components/manual/ui";
import { GroupSelect } from "./GroupSelect";

/** Agregar correos a un grupo con un rol. Las personas entrarán con Google usando ese correo. */
export function AddPeopleForm({ viewer, groups, initialGroupId, onDone }: { viewer: Viewer; groups: GroupItem[]; initialGroupId: string; onDone: (groupId: string) => void }) {
  const sb = useMemo(() => createClient(), []);
  const allowed = useMemo(() => groups.filter((g) => assignableRoles(viewer, g).length > 0), [groups, viewer]);
  const [groupId, setGroupId] = useState(allowed.some((g) => g.id === initialGroupId) ? initialGroupId : (allowed[0]?.id ?? ""));
  const [role, setRole] = useState<GroupRole>("voluntario");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<InviteResult | null>(null);

  const group = allowed.find((g) => g.id === groupId);
  const roles = group ? assignableRoles(viewer, group) : [];
  const effectiveRole = roles.includes(role) ? role : (roles.at(-1) ?? "voluntario");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!group) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const r = await inviteEmails(sb, text, { kind: "group", groupId: group.id, role: effectiveRole });
      setResult(r);
      setText("");
      onDone(group.id);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!allowed.length) return null;

  return (
    <form onSubmit={submit} className="space-y-3 rounded-2xl border border-line bg-surface p-5" aria-label="Agregar personas">
      <h2 className="text-lg font-extrabold">Agregar personas</h2>
      <p className="text-sm text-muted">Escribe o pega los correos de Google. Podrán entrar a la aplicación con ese correo y quedarán en el grupo con el rol que elijas.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="ap-group">Grupo</label>
          <GroupSelect id="ap-group" label="Grupo al que se agrega" groups={allowed} value={groupId} onChange={setGroupId} disabled={allowed.length === 1} />
        </div>
        <div>
          <label className={label} htmlFor="ap-role">Rol</label>
          <select id="ap-role" className={input} value={effectiveRole} onChange={(e) => setRole(e.target.value as GroupRole)}>
            {roles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className={label} htmlFor="ap-emails">Correos (uno por línea, o separados por comas)</label>
        <textarea id="ap-emails" className={`${input} min-h-28 font-mono`} value={text} onChange={(e) => setText(e.target.value)} placeholder={"ana@gmail.com\nluis@gmail.com"} spellCheck={false} />
      </div>
      <ErrorText error={error} />
      {result && (
        <div role="status" className="space-y-1 rounded-lg border border-line bg-bg p-3 text-sm">
          {result.added.length > 0 && <p>✅ Agregados ({result.added.length}): {result.added.join(", ")}</p>}
          {result.existing.length > 0 && <p>⚠️ Ya tenían invitación o cuenta, no se tocaron ({result.existing.length}): {result.existing.join(", ")}. Si están en otro grupo, pide que los muevan.</p>}
          {result.invalid.length > 0 && <p>❌ No son correos válidos ({result.invalid.length}): {result.invalid.join(", ")}</p>}
        </div>
      )}
      <button className={btnPrimary} disabled={busy || !text.trim()}>{busy ? "Agregando…" : "Agregar"}</button>
    </form>
  );
}

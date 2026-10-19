"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { AdminItem, LeaderItem, PendingStaff } from "@/lib/people/load";
import { addLeaderSite, deleteInvitation, deletePerson, inviteEmails, removeLeaderSite, type InviteResult } from "@/lib/people/mutations";
import type { SiteItem } from "@/lib/people/types";
import { btn, btnDanger, btnPrimary, ErrorText, input, label } from "@/components/manual/ui";

function useAction() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try { await fn(); router.refresh(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return { busy, error, setError, run };
}

type Props = { viewerId: string; isAdmin: boolean; sites: SiteItem[]; leaders: LeaderItem[]; admins: AdminItem[]; pending: PendingStaff[] };

export function LeadersAdmin({ viewerId, isAdmin, sites, leaders, admins, pending }: Props) {
  const sb = useMemo(() => createClient(), []);
  const { busy, error, run } = useAction();
  const removePerson = (name: string, id: string) => {
    if (window.confirm(`¿Eliminar a ${name} de la aplicación? Perderá el acceso y tendrás que invitarla de nuevo para que vuelva.`)) run(() => deletePerson(sb, id));
  };

  return (
    <div className="space-y-10">
      <section aria-label="Líderes de sede" className="space-y-4">
        <h2 className="text-xl font-extrabold">Líderes de sede</h2>
        <p className="text-sm text-muted">Acompañan a los grupos de su sede: ven todos sus grupos, administran personas, horarios y el manual de su sede. No pertenecen a ningún grupo.</p>
        {leaders.length === 0 && <p className="rounded-2xl border border-line bg-surface p-5 text-muted">Todavía no hay líderes de sede.</p>}
        <ul className="space-y-3">
          {leaders.map((l) => {
            const free = sites.filter((s) => !l.sites.some((x) => x.id === s.id));
            return (
              <li key={l.userId} className="space-y-2 rounded-2xl border border-line bg-surface p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="min-w-0 flex-1"><span className="block font-semibold">{l.name}</span><span className="block truncate text-sm text-muted">{l.email ?? "Correo privado"}</span></span>
                  <button type="button" className={btnDanger} disabled={busy} onClick={() => removePerson(l.name, l.userId)} aria-label={`Eliminar a ${l.name}`}>Eliminar de la aplicación</button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {l.sites.map((s) => (
                    <span key={s.id} className="inline-flex items-center gap-1 rounded-full bg-badge px-3 py-1 text-sm font-bold text-on-badge">
                      {s.name}
                      {l.sites.length > 1 && (
                        <button type="button" aria-label={`Quitar ${s.name} a ${l.name}`} className="ml-1 font-black" disabled={busy} onClick={() => run(() => removeLeaderSite(sb, l.userId, s.id))}>✕</button>
                      )}
                    </span>
                  ))}
                  {free.length > 0 && (
                    <select aria-label={`Agregar sede a ${l.name}`} className={`${input} w-auto`} value="" disabled={busy} onChange={(e) => e.target.value && run(() => addLeaderSite(sb, l.userId, e.target.value))}>
                      <option value="">＋ Agregar sede…</option>
                      {free.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        <InviteLeader sites={sites} />
      </section>

      <section aria-label="Cabeza de ministerio y administradores" className="space-y-4">
        <h2 className="text-xl font-extrabold">Cabeza de ministerio y administradores</h2>
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
          {admins.map((a) => (
            <li key={a.userId} className="flex flex-wrap items-center gap-3 p-3">
              <span className="min-w-0 flex-1"><span className="block font-semibold">{a.name}{a.userId === viewerId && <span className="ml-2 text-xs text-muted">(tú)</span>}</span><span className="block truncate text-sm text-muted">{a.email ?? "Correo privado"}</span></span>
              <span className="rounded-full border border-line px-2.5 py-0.5 text-xs font-bold">{a.isAdmin ? "Administrador" : "Cabeza de ministerio"}</span>
              {isAdmin && a.userId !== viewerId && <button type="button" className={btnDanger} disabled={busy} onClick={() => removePerson(a.name, a.userId)} aria-label={`Eliminar a ${a.name}`}>Eliminar</button>}
            </li>
          ))}
        </ul>
        {isAdmin && <InviteTop />}
      </section>

      <section aria-label="Invitaciones pendientes" className="space-y-3">
        <h2 className="text-xl font-extrabold">Invitaciones pendientes ({pending.length})</h2>
        {pending.length === 0 ? <p className="rounded-2xl border border-line bg-surface p-5 text-muted">No hay invitaciones pendientes de líderes ni administradores.</p> : (
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {pending.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 p-3">
                <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{p.email}</span><span className="block text-sm text-muted">{p.label}</span></span>
                <button type="button" className={btnDanger} disabled={busy} aria-label={`Quitar la invitación de ${p.email}`} onClick={() => run(() => deleteInvitation(sb, p.id))}>Quitar</button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <ErrorText error={error} />
    </div>
  );
}

function ResultBox({ r }: { r: InviteResult }) {
  return (
    <div role="status" className="space-y-1 rounded-lg border border-line bg-bg p-3 text-sm">
      {r.added.length > 0 && <p>✅ Agregados: {r.added.join(", ")}</p>}
      {r.existing.length > 0 && <p>⚠️ Ya tenían invitación o cuenta, no se tocaron: {r.existing.join(", ")}</p>}
      {r.invalid.length > 0 && <p>❌ No son correos válidos: {r.invalid.join(", ")}</p>}
    </div>
  );
}

function InviteLeader({ sites }: { sites: SiteItem[] }) {
  const sb = useMemo(() => createClient(), []);
  const { busy, error, setError, run } = useAction();
  const [text, setText] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [result, setResult] = useState<InviteResult | null>(null);
  return (
    <form className="space-y-3 rounded-2xl border border-line bg-surface p-5" aria-label="Invitar líder de sede" onSubmit={(e) => {
      e.preventDefault();
      setResult(null);
      run(async () => { setResult(await inviteEmails(sb, text, { kind: "leader", siteIds: picked })); setText(""); });
    }}>
      <h3 className="text-lg font-extrabold">Invitar líder de sede</h3>
      <fieldset>
        <legend className={label}>Sedes que acompañará</legend>
        <div className="flex flex-wrap gap-x-5 gap-y-1">
          {sites.map((s) => (
            <label key={s.id} className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" checked={picked.includes(s.id)} onChange={() => { setError(null); setPicked((p) => (p.includes(s.id) ? p.filter((x) => x !== s.id) : [...p, s.id])); }} />{s.name}
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <label className={label} htmlFor="il-emails">Correos</label>
        <textarea id="il-emails" className={`${input} min-h-20 font-mono`} value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} />
      </div>
      <ErrorText error={error} />
      {result && <ResultBox r={result} />}
      <button className={btnPrimary} disabled={busy || !text.trim() || !picked.length}>Invitar líder</button>
    </form>
  );
}

function InviteTop() {
  const sb = useMemo(() => createClient(), []);
  const { busy, error, run } = useAction();
  const [text, setText] = useState("");
  const [kind, setKind] = useState<"head" | "admin">("head");
  const [result, setResult] = useState<InviteResult | null>(null);
  return (
    <form className="space-y-3 rounded-2xl border border-line bg-surface p-5" aria-label="Invitar cabeza o administrador" onSubmit={(e) => {
      e.preventDefault();
      setResult(null);
      run(async () => { setResult(await inviteEmails(sb, text, { kind })); setText(""); });
    }}>
      <h3 className="text-lg font-extrabold">Invitar cabeza de ministerio o administrador</h3>
      <p className="text-sm text-muted">La cabeza de ministerio ve todas las sedes. El administrador, además, gestiona el sistema. Dalo con cuidado.</p>
      <div>
        <label className={label} htmlFor="it-kind">Rol</label>
        <select id="it-kind" className={input} value={kind} onChange={(e) => setKind(e.target.value as "head" | "admin")}>
          <option value="head">Cabeza de ministerio</option>
          <option value="admin">Administrador</option>
        </select>
      </div>
      <div>
        <label className={label} htmlFor="it-emails">Correos</label>
        <textarea id="it-emails" className={`${input} min-h-20 font-mono`} value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} />
      </div>
      <ErrorText error={error} />
      {result && <ResultBox r={result} />}
      <button className={btn} disabled={busy || !text.trim()}>Invitar</button>
    </form>
  );
}

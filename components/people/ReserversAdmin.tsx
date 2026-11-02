"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { PendingStaff, ReserverItem } from "@/lib/people/load";
import { addReserverSite, deleteInvitation, deletePerson, inviteEmails, removeReserverSite, type InviteResult } from "@/lib/people/mutations";
import type { SiteItem } from "@/lib/people/types";
import { btnDanger, btnPrimary, ErrorText, input, label } from "@/components/manual/ui";

type Props = { viewerId: string; sites: SiteItem[]; reservers: ReserverItem[]; pending: PendingStaff[] };

/** Rol adicional «Reservas»: quién puede registrar reservas de puestos en cada sede. Lo da quien administra la sede. */
export function ReserversAdmin({ viewerId, sites, reservers, pending }: Props) {
  const sb = useMemo(() => createClient(), []);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [picked, setPicked] = useState<string[]>(sites.length === 1 ? [sites[0].id] : []);
  const [result, setResult] = useState<InviteResult | null>(null);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError(null);
    try { await fn(); router.refresh(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-8">
      <section aria-label="Personas con el rol Reservas" className="space-y-3">
        <h2 className="text-xl font-extrabold">Quienes registran reservas ({reservers.length})</h2>
        {reservers.length === 0 ? <p className="rounded-2xl border border-line bg-surface p-5 text-muted">Todavía no hay personas con este rol.</p> : (
          <ul className="space-y-3">
            {reservers.map((r) => {
              const free = sites.filter((s) => !r.sites.some((x) => x.id === s.id));
              return (
                <li key={r.userId} className="space-y-2 rounded-2xl border border-line bg-surface p-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="min-w-0 flex-1"><span className="block font-semibold">{r.name}{r.userId === viewerId && <span className="ml-2 text-xs text-muted">(tú)</span>}</span><span className="block truncate text-sm text-muted">{r.email ?? "Correo privado"}</span></span>
                    {r.userId !== viewerId && (
                      <button type="button" className={btnDanger} disabled={busy} aria-label={`Eliminar a ${r.name}`}
                        onClick={() => { if (window.confirm(`¿Eliminar a ${r.name} de la aplicación? Perderá el acceso y tendrás que invitarla de nuevo para que vuelva.`)) run(() => deletePerson(sb, r.userId)); }}>Eliminar de la aplicación</button>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {r.sites.map((s) => (
                      <span key={s.id} className="inline-flex items-center gap-1 rounded-full bg-badge px-3 py-1 text-sm font-bold text-on-badge">
                        {s.name}
                        <button type="button" aria-label={`Quitar ${s.name} a ${r.name}`} className="ml-1 font-black" disabled={busy} onClick={() => run(() => removeReserverSite(sb, r.userId, s.id))}>✕</button>
                      </span>
                    ))}
                    {free.length > 0 && (
                      <select aria-label={`Agregar sede a ${r.name}`} className={`${input} w-auto`} value="" disabled={busy} onChange={(e) => e.target.value && run(() => addReserverSite(sb, r.userId, e.target.value))}>
                        <option value="">＋ Agregar sede…</option>
                        {free.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <form className="space-y-3 rounded-2xl border border-line bg-surface p-5" aria-label="Invitar para reservas" onSubmit={(e) => {
        e.preventDefault();
        setResult(null);
        run(async () => { setResult(await inviteEmails(sb, text, { kind: "reserver", siteIds: picked })); setText(""); });
      }}>
        <h2 className="text-lg font-extrabold">Invitar a registrar reservas</h2>
        <p className="text-sm text-muted">La persona entra con Google y solo ve el cuadro para reservar puestos (fecha, zona, fila, puestos y para quién). No ve el manual, los grupos ni las novedades.</p>
        <fieldset>
          <legend className={label}>Sedes donde podrá reservar</legend>
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            {sites.map((s) => (
              <label key={s.id} className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" checked={picked.includes(s.id)} onChange={() => { setError(null); setPicked((p) => (p.includes(s.id) ? p.filter((x) => x !== s.id) : [...p, s.id])); }} />{s.name}
              </label>
            ))}
          </div>
        </fieldset>
        <div>
          <label className={label} htmlFor="rs-emails">Correos</label>
          <textarea id="rs-emails" className={`${input} min-h-20 font-mono`} value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} />
        </div>
        <ErrorText error={error} />
        {result && (
          <div role="status" className="space-y-1 rounded-lg border border-line bg-bg p-3 text-sm">
            {result.added.length > 0 && <p>✅ Agregados: {result.added.join(", ")}</p>}
            {result.existing.length > 0 && <p>⚠️ Ya tenían invitación o cuenta, no se tocaron: {result.existing.join(", ")}</p>}
            {result.invalid.length > 0 && <p>❌ No son correos válidos: {result.invalid.join(", ")}</p>}
          </div>
        )}
        <button className={btnPrimary} disabled={busy || !text.trim() || !picked.length}>Invitar</button>
      </form>

      <section aria-label="Invitaciones pendientes de reservas" className="space-y-3">
        <h2 className="text-xl font-extrabold">Invitaciones pendientes ({pending.length})</h2>
        {pending.length === 0 ? <p className="rounded-2xl border border-line bg-surface p-5 text-muted">No hay invitaciones pendientes para este rol.</p> : (
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

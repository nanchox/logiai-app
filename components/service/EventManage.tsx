"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { btn, btnDanger, ErrorText, input, label } from "@/components/manual/ui";
import { createClient } from "@/lib/supabase/client";
import { addCancellation, deleteEvent, resetEventGroup, saveEventNote, setEventGroup } from "@/lib/service/mutations";
import type { ServiceEvent } from "@/lib/service/types";

/** Controles de quien administra la sede (líder, cabeza, admin): cambiar el grupo, la nota y cancelar. */
export function EventManage({ event, groups, hasPlan, canAllSites }: { event: ServiceEvent; groups: { id: string; name: string }[]; hasPlan: boolean; canAllSites: boolean }) {
  const sb = useMemo(() => createClient(), []);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [group, setGroup] = useState(event.groupId ?? groups[0]?.id ?? "");
  const [note, setNote] = useState(event.note ?? "");
  const [reason, setReason] = useState("");

  const run = async (fn: () => Promise<void>, after?: () => void) => {
    setBusy(true);
    setError(null);
    try { await fn(); if (after) after(); else router.refresh(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const cancel = (siteId: string | null, slotId: string | null, what: string) => {
    if (window.confirm(`¿Cancelar ${what} el ${event.date}? Ese turno se pierde y la rotación sigue con el grupo de la semana siguiente.`))
      run(() => addCancellation(sb, { date: event.date, siteId, slotId, reason }));
  };

  return (
    <section aria-label="Administrar servicio" className="space-y-4 rounded-2xl border border-line bg-surface p-5">
      <h2 className="text-lg font-extrabold">Administrar este servicio</h2>
      <ErrorText error={error} />

      <form className="flex flex-wrap items-end gap-3" aria-label="Cambiar el grupo que sirve" onSubmit={(e) => {
        e.preventDefault();
        if (group === event.groupId) return;
        if (hasPlan && !window.confirm("Al cambiar de grupo se borra la planeación y los archivos de este servicio dejan de aplicar al nuevo grupo. ¿Continuar?")) return;
        run(() => setEventGroup(sb, event.id, group));
      }}>
        <div className="min-w-48 flex-1">
          <label className={label} htmlFor="ev-group">Grupo que sirve</label>
          <select id="ev-group" className={input} value={group} onChange={(e) => setGroup(e.target.value)}>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </div>
        <button type="submit" className={btn} disabled={busy || group === event.groupId}>Cambiar grupo</button>
        {event.kind === "rotacion" && event.manual && (
          <button type="button" className={btn} disabled={busy} onClick={() => run(() => resetEventGroup(sb, event.id))}>Volver a la rotación</button>
        )}
      </form>

      <form className="flex flex-wrap items-end gap-3" aria-label="Nota del servicio" onSubmit={(e) => { e.preventDefault(); run(() => saveEventNote(sb, event.id, note)); }}>
        <div className="min-w-48 flex-1">
          <label className={label} htmlFor="ev-note">Nota del servicio</label>
          <input id="ev-note" className={input} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Visible para el grupo que sirve" />
        </div>
        <button type="submit" className={btn} disabled={busy || note.trim() === (event.note ?? "")}>Guardar nota</button>
      </form>

      {event.status === "programado" ? (
        <div className="space-y-2 border-t border-line pt-4">
          <label className={label} htmlFor="ev-reason">Cancelar (motivo opcional)</label>
          <input id="ev-reason" className={input} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Navidad, retiro…" />
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btnDanger} disabled={busy} onClick={() => cancel(event.siteId, event.slotId, "este horario")}>Cancelar este horario</button>
            <button type="button" className={btnDanger} disabled={busy} onClick={() => cancel(event.siteId, null, `todos los horarios de ${event.siteName}`)}>Cancelar toda la sede</button>
            {canAllSites && <button type="button" className={btnDanger} disabled={busy} onClick={() => cancel(null, null, "el servicio en todas las sedes")}>Cancelar en todas las sedes</button>}
          </div>
        </div>
      ) : (
        <p className="border-t border-line pt-4 text-sm text-muted">Para reactivar un servicio cancelado, quita la cancelación en <Link href="/personas/rotacion">Rotación</Link>.</p>
      )}

      {event.kind === "especial" && (
        <div className="border-t border-line pt-4">
          <button type="button" className={btnDanger} disabled={busy} onClick={() => {
            if (window.confirm("¿Eliminar este servicio especial y su planeación?")) run(() => deleteEvent(sb, event.id), () => router.push("/servicio"));
          }}>Eliminar servicio especial</button>
        </div>
      )}
    </section>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { StatusBadges } from "@/components/service/RotationAdmin";
import { RetireSupport } from "@/components/support/RetireSupport";
import { SupportRequests } from "@/components/support/SupportRequests";
import { requireUser } from "@/lib/auth";
import { serviceLabel } from "@/lib/labels";
import { addDays, formatServiceDate, formatServiceDateShort, todayCo } from "@/lib/service/dates";
import { loadEvents, loadHistory, loadPlan, loadPlanPositions } from "@/lib/service/load";
import { loadMyAbsences, loadMySupportEvents, loadOpenRequests, loadOutgoingSupports } from "@/lib/support/load";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Mi servicio" };

export default async function MyServicePage() {
  const user = await requireUser();
  const supabase = await createClient();
  const today = todayCo();
  const groupId = user.membership?.groupId;
  const staff = user.isAdmin || user.isHead || user.leaderSites.length > 0;

  // Un miembro ve los servicios de su grupo; quien acompaña a los grupos, los de su alcance.
  const [events, history, requests, supportEvents, absences, outgoing] = await Promise.all([
    loadEvents(supabase, { from: today, until: addDays(today, 56), limit: 80, ...(!staff && groupId ? { groupId } : {}) }),
    loadHistory(supabase, user.id),
    loadOpenRequests(supabase),
    loadMySupportEvents(supabase),
    loadMyAbsences(supabase, user.id),
    groupId && user.membership?.role === "coordinador" ? loadOutgoingSupports(supabase, groupId) : Promise.resolve([]),
  ]);
  // Quien apoya no ve el nombre de un grupo ajeno con sus permisos normales: se toma de sus apoyos.
  const supportGroup = new Map(supportEvents.map((e) => [e.eventId, e.groupName]));
  const mySupports = supportEvents.filter((e) => e.date >= today && e.status === "programado");
  const mine = groupId ? events.filter((e) => e.groupId === groupId) : [];
  const next = mine.find((e) => e.status === "programado");

  let myPositions: string[] = [];
  if (next) {
    const [plan, positions] = await Promise.all([loadPlan(supabase, next.id), loadPlanPositions(supabase, next.siteId, next.day, next.shift)]);
    const byId = new Map(positions.map((p) => [p.id, p]));
    myPositions = plan.status === "publicado"
      ? plan.assignments.filter((a) => a.userId === user.id).map((a) => byId.get(a.positionId)).filter((p) => !!p).map((p) => `${p.code} · ${p.name}`)
      : [];
  }

  return (
    <main className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">Mi servicio</h1>
        <p className="mt-1 text-muted">Cuándo sirve tu grupo, qué posición te tocó y tu historial.</p>
      </div>

      {user.membership && (
        <section aria-label="Próximo servicio" className="rounded-2xl border border-line bg-surface p-5">
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted">Próximo servicio de {user.membership.groupName}</h2>
          {next ? (
            <>
              <p className="mt-1 text-xl font-bold">{formatServiceDate(next.date)}</p>
              <p className="text-muted">{serviceLabel(next.day, next.shift)} · {next.siteName}</p>
              <p className="mt-3 text-sm">
                {myPositions.length ? <>Tus posiciones: <strong>{myPositions.join(" · ")}</strong></> : "Todavía no hay posiciones publicadas para ti."}
              </p>
              <p className="mt-3"><Link href={`/servicio/${next.id}`} className="font-semibold">Ver el servicio →</Link></p>
            </>
          ) : (
            <p className="mt-1 text-muted">Todavía no hay servicios programados para tu grupo. Tu líder de sede los genera en la rotación.</p>
          )}
        </section>
      )}

      {requests.length > 0 && (
        <section aria-label="Solicitudes de apoyo" className="space-y-3">
          <h2 className="text-lg font-extrabold">Solicitudes de apoyo</h2>
          <p className="text-sm text-muted">Otros grupos de tu sede necesitan ayuda. Si puedes, postúlate: el grupo que pide decide.</p>
          <SupportRequests requests={requests} />
        </section>
      )}

      {mySupports.length > 0 && (
        <section aria-label="Servicios en los que apoyo" className="space-y-3">
          <h2 className="text-lg font-extrabold">Servicios en los que apoyo</h2>
          <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
            {mySupports.map((e) => (
              <li key={e.eventId} className="flex flex-wrap items-center gap-2 px-4 py-3">
                <span className="w-36 font-semibold">{formatServiceDateShort(e.date)}</span>
                <span className="flex-1"><span className="font-semibold">Apoyo a {e.groupName ?? "otro grupo"}</span><span className="text-muted"> · {serviceLabel(e.day, e.shift)} · {e.siteName}</span></span>
                <Link href={`/servicio/${e.eventId}`} className="text-sm font-semibold">Abrir</Link>
                <RetireSupport eventId={e.eventId} userId={user.id} groupName={e.groupName ?? "otro grupo"} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {outgoing.length > 0 && (
        <section aria-label="Apoyos de mi grupo a otros" className="space-y-3">
          <h2 className="text-lg font-extrabold">Personas de mi grupo que apoyan a otros</h2>
          <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
            {outgoing.map((o, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2 px-4 py-3">
                <span className="w-36 font-semibold">{formatServiceDateShort(o.date)}</span>
                <span className="flex-1"><span className="font-semibold">{o.name}</span><span className="text-muted"> apoya a {o.toGroupName ?? "otro grupo"} · {o.siteName}</span></span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-label="Próximos servicios" className="space-y-3">
        <h2 className="text-lg font-extrabold">{staff ? "Próximas semanas" : "Calendario de mi grupo"}</h2>
        {events.length === 0 ? <p className="rounded-2xl border border-line bg-surface p-5 text-muted">No hay servicios programados en las próximas 8 semanas.</p> : (
          <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
            {events.map((e) => (
              <li key={e.id} className={`flex flex-wrap items-center gap-2 px-4 py-3 ${e.groupId === groupId ? "bg-accent/10" : ""}`}>
                <span className="w-36 font-semibold">{formatServiceDateShort(e.date)}</span>
                <span className="flex-1">
                  <span className="font-semibold">{e.groupName ?? "Sin grupo"}</span>
                  <span className="text-muted"> · {serviceLabel(e.day, e.shift)} · {e.siteName}</span>
                </span>
                <StatusBadges e={e} />
                {absences.has(e.id) && <span className="rounded-full bg-danger px-2 py-0.5 text-xs font-bold text-white">Marcado como ausente</span>}
                <Link href={`/servicio/${e.id}`} className="text-sm font-semibold">Abrir</Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Mi historial" className="space-y-3">
        <h2 className="text-lg font-extrabold">Mi historial de posiciones</h2>
        {history.length === 0 ? <p className="rounded-2xl border border-line bg-surface p-5 text-muted">Aquí aparecerán las posiciones que te asignen en la planeación publicada.</p> : (
          <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
            {history.map((h) => (
              <li key={`${h.eventId}-${h.positionCode}`} className="flex flex-wrap items-center gap-2 px-4 py-3">
                <span className="w-36 font-semibold">{formatServiceDateShort(h.date)}</span>
                <span className="flex-1"><span className="font-semibold">{h.positionCode} · {h.positionName}</span><span className="text-muted"> · {serviceLabel(h.day, h.shift)} · {h.siteName}</span>{groupId && h.groupId && h.groupId !== groupId && <span className="ml-2 rounded-full bg-info px-2 py-0.5 text-xs font-bold text-on-info">Apoyo a {h.groupName ?? supportGroup.get(h.eventId) ?? "otro grupo"}</span>}</span>
                <span className="text-xs text-muted">{h.date > today ? "Próximo" : ""}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

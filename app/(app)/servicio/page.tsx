import type { Metadata } from "next";
import Link from "next/link";
import { StatusBadges } from "@/components/service/RotationAdmin";
import { requireUser } from "@/lib/auth";
import { serviceLabel } from "@/lib/labels";
import { addDays, formatServiceDate, formatServiceDateShort, todayCo } from "@/lib/service/dates";
import { loadEvents, loadHistory, loadPlan, loadPlanPositions } from "@/lib/service/load";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Mi servicio" };

export default async function MyServicePage() {
  const user = await requireUser();
  const supabase = await createClient();
  const today = todayCo();
  const groupId = user.membership?.groupId;
  const staff = user.isAdmin || user.isHead || user.leaderSites.length > 0;

  // Un miembro ve los servicios de su grupo; quien acompaña a los grupos, los de su alcance.
  const [events, history] = await Promise.all([
    loadEvents(supabase, { from: today, until: addDays(today, 56), limit: 80, ...(!staff && groupId ? { groupId } : {}) }),
    loadHistory(supabase, user.id),
  ]);
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
                <span className="flex-1"><span className="font-semibold">{h.positionCode} · {h.positionName}</span><span className="text-muted"> · {serviceLabel(h.day, h.shift)} · {h.siteName}</span></span>
                <span className="text-xs text-muted">{h.date > today ? "Próximo" : ""}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

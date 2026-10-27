import type { Metadata } from "next";
import Link from "next/link";
import { ActiveBadge } from "@/components/service/ActiveBadge";
import { RotationQuick, type QuickSlot } from "@/components/service/RotationQuick";
import { StatusBadges } from "@/components/service/RotationAdmin";
import { Tabs, pickTab, type TabItem } from "@/components/service/Tabs";
import { RetireSupport } from "@/components/support/RetireSupport";
import { SupportRequests } from "@/components/support/SupportRequests";
import { requireUser } from "@/lib/auth";
import { serviceLabel } from "@/lib/labels";
import { loadSlots } from "@/lib/people/load";
import { activeServices } from "@/lib/service/active";
import { addDays, formatServiceDate, formatServiceDateShort, todayCo } from "@/lib/service/dates";
import { isStaff } from "@/lib/service/load-active";
import { loadEvents, loadHistory, loadLastRotationDates, loadPlan, loadPlanPositions, loadRotationGroups } from "@/lib/service/load";
import { loadPendingCounts } from "@/lib/counts/load";
import { loadMyAbsences, loadMySupportEvents, loadOpenRequests, loadOutgoingSupports } from "@/lib/support/load";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Mi servicio" };

export default async function MyServicePage({ searchParams }: PageProps<"/servicio">) {
  const user = await requireUser();
  const supabase = await createClient();
  const today = todayCo();
  const groupId = user.membership?.groupId ?? null;
  const staff = isStaff(user);
  const planner = !!user.membership && ["coordinador", "supervisor"].includes(user.membership.role);
  const manager = user.canManageGroups;

  // Un miembro ve los servicios de su grupo; quien acompaña a los grupos, los de su alcance.
  const [events, history, requests, supportEvents, absences, outgoing, pendingCounts] = await Promise.all([
    loadEvents(supabase, { from: today, until: addDays(today, 60), limit: 200, ...(!staff && groupId ? { groupId } : {}) }),
    loadHistory(supabase, user.id),
    loadOpenRequests(supabase),
    loadMySupportEvents(supabase),
    loadMyAbsences(supabase, user.id),
    groupId && user.membership?.role === "coordinador" ? loadOutgoingSupports(supabase, groupId) : Promise.resolve([]),
    groupId && planner ? loadPendingCounts(supabase, groupId, today) : Promise.resolve([]),
  ]);
  const pendingRequests = requests.filter((r) => r.myStatus === null).length;
  const tabs: TabItem[] = [
    { id: "servicios", label: "Servicios" },
    { id: "apoyos", label: "Apoyos", badge: pendingRequests },
    ...(planner || manager ? [{ id: "conteos", label: "Conteos", badge: pendingCounts.length }] : []),
    { id: "posiciones", label: "Posiciones" },
    ...(manager ? [{ id: "administrar", label: "Administrar" }] : []),
  ];
  const { tab: wanted } = await searchParams;
  const tab = pickTab(tabs, wanted);

  // Servicios activos: los de hoy y el siguiente (de mi grupo, de mi alcance y aquellos en los que apoyo).
  const active = activeServices({ events, supports: supportEvents, today, groupId, staff });
  const activeIds = new Set(active.map((a) => a.eventId));
  // Quien apoya no ve el nombre de un grupo ajeno con sus permisos normales: se toma de sus apoyos.
  const supportGroup = new Map(supportEvents.map((e) => [e.eventId, e.groupName]));
  const mySupports = supportEvents.filter((e) => e.date >= today && e.status === "programado");

  // Mis posiciones (publicadas) en los servicios activos de mi grupo.
  const myPositions = new Map<string, string[]>();
  if (tab === "servicios") {
    for (const a of active.filter((x) => x.kind === "grupo")) {
      const e = events.find((x) => x.id === a.eventId);
      if (!e) continue;
      const [plan, positions] = await Promise.all([loadPlan(supabase, e.id), loadPlanPositions(supabase, e.siteId, e.day, e.shift)]);
      const byId = new Map(positions.map((p) => [p.id, p]));
      myPositions.set(e.id, plan.status === "publicado"
        ? plan.assignments.filter((x) => x.userId === user.id).map((x) => byId.get(x.positionId)).filter((p) => !!p).map((p) => `${p.code} · ${p.name}`)
        : []);
    }
  }

  // Administrar: generar más rotación (solo líder, cabeza y administrador).
  let quickSlots: QuickSlot[] = [];
  if (tab === "administrar" && manager) {
    const [slots, groups, lastDates, { data: sites }] = await Promise.all([
      loadSlots(supabase), loadRotationGroups(supabase), loadLastRotationDates(supabase), supabase.from("sites").select("id, name").order("sort"),
    ]);
    const siteName = new Map((sites ?? []).map((s) => [s.id, s.name]));
    quickSlots = slots
      .filter((s) => user.isAdmin || user.isHead || user.leaderSites.some((l) => l.id === s.siteId))
      .map((s) => ({ id: s.id, siteName: siteName.get(s.siteId) ?? "", day: s.day, shift: s.shift, groups: groups.filter((g) => g.slotId === s.id).length, last: lastDates[s.id] ?? null }))
      .sort((a, b) => a.siteName.localeCompare(b.siteName, "es"));
  }

  return (
    <main className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">Mi servicio</h1>
        <p className="mt-1 text-muted">Lo que está activo ahora, tus apoyos, los conteos y tus posiciones.</p>
      </div>
      <Tabs tabs={tabs} current={tab} base="/servicio" />

      {tab === "servicios" && (
        <>
          <section aria-label="Servicios activos" className="space-y-3">
            <h2 className="text-lg font-extrabold">Servicios activos</h2>
            {active.length === 0 ? (
              <p className="rounded-2xl border border-line bg-surface p-5 text-muted">
                No hay un servicio activo ahora. {staff ? "Genera las fechas en la pestaña Administrar." : "Cuando tu grupo tenga un servicio hoy o próximo, aparecerá aquí."}
              </p>
            ) : (
              <ul className="space-y-3">
                {active.map((a) => {
                  const pos = myPositions.get(a.eventId);
                  const canCountNow = (planner || manager) && a.date <= today;
                  return (
                    <li key={a.eventId} aria-label={`Servicio activo ${a.date}`} className="rounded-2xl border-2 border-accent bg-surface p-5">
                      <div className="flex flex-wrap items-center gap-2"><ActiveBadge today={a.isToday} />{a.kind === "apoyo" && <span className="rounded-full bg-info px-2.5 py-0.5 text-xs font-bold text-on-info">Apoyo</span>}</div>
                      <p className="mt-2 text-xl font-bold">{formatServiceDate(a.date)}</p>
                      <p className="text-muted">
                        {serviceLabel(a.day, a.shift)} · {a.siteName}
                        {a.groupName ? <> · <strong className="text-fg">{a.kind === "apoyo" ? `Apoyo a ${a.groupName}` : a.groupName}</strong></> : null}
                      </p>
                      {a.kind === "grupo" && (
                        <p className="mt-2 text-sm">{pos && pos.length ? <>Tus posiciones: <strong>{pos.join(" · ")}</strong></> : "Todavía no hay posiciones publicadas para ti."}</p>
                      )}
                      <div className="mt-3 flex flex-wrap gap-3 text-sm font-semibold">
                        <Link href={`/servicio/${a.eventId}`}>Abrir el servicio →</Link>
                        {planner && a.kind === "grupo" && <Link href={`/servicio/${a.eventId}?tab=apoyos`}>Apoyos</Link>}
                        {canCountNow && <Link href={`/servicio/${a.eventId}?tab=conteos`}>Registrar conteos</Link>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section aria-label="Próximos servicios" className="space-y-3">
            <h2 className="text-lg font-extrabold">{staff ? "Próximas semanas" : "Calendario de mi grupo"}</h2>
            {events.length === 0 ? <p className="rounded-2xl border border-line bg-surface p-5 text-muted">No hay servicios programados en las próximas 8 semanas.</p> : (
              <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
                {events.map((e) => (
                  <li key={e.id} className={`flex flex-wrap items-center gap-2 px-4 py-3 ${activeIds.has(e.id) ? "border-l-4 border-accent bg-accent/10" : e.groupId === groupId ? "bg-accent/5" : ""}`}>
                    <span className="w-36 font-semibold">{formatServiceDateShort(e.date)}</span>
                    <span className="flex-1">
                      <span className="font-semibold">{e.groupName ?? "Sin grupo"}</span>
                      <span className="text-muted"> · {serviceLabel(e.day, e.shift)} · {e.siteName}</span>
                    </span>
                    {activeIds.has(e.id) && <ActiveBadge today={e.date === today} />}
                    <StatusBadges e={e} />
                    {absences.has(e.id) && <span className="rounded-full bg-danger px-2 py-0.5 text-xs font-bold text-white">Marcado como ausente</span>}
                    <Link href={`/servicio/${e.id}`} className="text-sm font-semibold">Abrir</Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {tab === "apoyos" && (
        <>
          <section aria-label="Solicitudes de apoyo" className="space-y-3">
            <h2 className="text-lg font-extrabold">Solicitudes de apoyo</h2>
            {requests.length === 0 ? <p className="rounded-2xl border border-line bg-surface p-5 text-muted">Ningún grupo de tu sede está pidiendo apoyo ahora.</p> : (
              <>
                <p className="text-sm text-muted">Otros grupos de tu sede necesitan ayuda. Si puedes, postúlate: el grupo que pide decide.</p>
                <SupportRequests requests={requests} />
              </>
            )}
          </section>

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
          {planner && <p className="text-sm text-muted">Para pedir apoyo o marcar ausencias, abre el próximo servicio de tu grupo y entra a su pestaña <strong>Apoyos</strong>.</p>}
        </>
      )}

      {tab === "conteos" && (
        <>
          {pendingCounts.length > 0 ? (
            <section aria-label="Conteos pendientes" className="rounded-2xl border border-danger/60 bg-danger/10 p-4">
              <h2 className="text-lg font-extrabold">Falta registrar los conteos</h2>
              <ul className="mt-2 space-y-1">
                {pendingCounts.map((e) => (
                  <li key={e.id} className="text-sm">
                    {formatServiceDate(e.date)} · {serviceLabel(e.day, e.shift)} · {e.siteName} — <Link href={`/servicio/${e.id}?tab=conteos`} className="font-semibold">Registrar conteos</Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : (
            <p className="rounded-2xl border border-line bg-surface p-5 text-muted">{planner ? "No tienes conteos pendientes." : "Los conteos se registran desde la página de cada servicio."}</p>
          )}
          <section aria-label="Reporte de conteos" className="rounded-2xl border border-line bg-surface p-5">
            <h2 className="text-lg font-extrabold">Reporte de conteos</h2>
            <p className="mt-1 text-sm text-muted">Totales por servicio, día y semana, frente a la capacidad.</p>
            <p className="mt-3 text-sm font-semibold"><Link href="/conteos">Ver el reporte de conteos →</Link>{manager && <> · <Link href="/conteos/configurar">Capacidad y guías de conteo</Link></>}</p>
          </section>
        </>
      )}

      {tab === "posiciones" && (
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
      )}

      {tab === "administrar" && manager && (
        <>
          <RotationQuick slots={quickSlots} today={today} />
          <section aria-label="Más herramientas" className="rounded-2xl border border-line bg-surface p-5">
            <h2 className="text-lg font-extrabold">Más herramientas</h2>
            <ul className="mt-2 space-y-1 text-sm font-semibold">
              <li><Link href="/personas/rotacion">Rotación completa: orden de los grupos, cancelaciones y servicios especiales</Link></li>
              <li><Link href="/personas/grupos">Grupos y horarios</Link></li>
              <li><Link href="/personas">Personas</Link></li>
              <li><Link href="/conteos/configurar">Capacidad y guías de conteo</Link></li>
            </ul>
          </section>
        </>
      )}
    </main>
  );
}

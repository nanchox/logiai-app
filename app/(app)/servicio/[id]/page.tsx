import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EventManage } from "@/components/service/EventManage";
import { FilesPanel } from "@/components/service/FilesPanel";
import { formatMeetingTime } from "@/lib/service/meetings";
import { loadEventMeetings } from "@/lib/service/load";
import { ReservationList } from "@/components/reservations/ReservationList";
import { loadSeatReservations } from "@/lib/reservations/load";
import { CountPanel } from "@/components/counts/CountPanel";
import { SupportPanel } from "@/components/support/SupportPanel";
import { PlanEditor } from "@/components/service/PlanEditor";
import { StatusBadges } from "@/components/service/RotationAdmin";
import { Tabs, pickTab, type TabItem } from "@/components/service/Tabs";
import { requireUser } from "@/lib/auth";
import { serviceLabel } from "@/lib/labels";
import { formatServiceDate } from "@/lib/service/dates";
import { loadCountLocations, loadCountLog, loadCounts, loadGuides, loadReservationDefaults, loadReservationOverrides, loadReservationZones } from "@/lib/counts/load";
import { canCountNow, countWindow } from "@/lib/counts/window";
import { addDays, todayCo } from "@/lib/service/dates";
import { loadEvent, loadEvents, loadPlan, loadPlanPositions, loadRotationGroups } from "@/lib/service/load";
import { loadApplications, loadEventPeople, loadEventRequest } from "@/lib/support/load";
import { canPlanEvent } from "@/lib/service/types";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Servicio" };

export default async function ServicePage({ params, searchParams }: PageProps<"/servicio/[id]">) {
  const { id } = await params;
  const { tab: wanted } = await searchParams;
  const user = await requireUser();
  const supabase = await createClient();
  const event = /^[0-9a-f-]{36}$/i.test(id) ? await loadEvent(supabase, id) : null;
  if (!event) notFound();

  const canManage = user.isAdmin || user.isHead || user.leaderSites.some((s) => s.id === event.siteId);
  const canPlan = event.status === "programado" && canPlanEvent(user, event);
  const [plan, positions, people, groups, upcoming] = await Promise.all([
    loadPlan(supabase, event.id),
    loadPlanPositions(supabase, event.siteId, event.day, event.shift),
    event.groupId ? loadEventPeople(supabase, event.id) : Promise.resolve([]),
    canManage ? loadRotationGroups(supabase) : Promise.resolve([]),
    canPlan && event.groupId ? loadEvents(supabase, { from: todayCo(), until: addDays(todayCo(), 120), groupId: event.groupId, limit: 12 }) : Promise.resolve([]),
  ]);
  // Los apoyos y las ausencias son solo del próximo servicio programado del grupo.
  const isNext = upcoming.find((e) => e.status === "programado")?.id === event.id;
  const [request] = await Promise.all([isNext ? loadEventRequest(supabase, event.id) : Promise.resolve(null)]);
  const applications = request ? await loadApplications(supabase, request.id) : [];
  // Conteos: la guía la ven quienes sirven ese día; los totales, quienes planifican el servicio.
  const [guides, countLocations, counts, countLog, zones, rsvDefaults, rsvOverrides] = event.status === "programado" && event.groupId
    ? await Promise.all([
        loadGuides(supabase, event.siteId),
        loadCountLocations(supabase, event.siteId),
        canPlan ? loadCounts(supabase, [event.id]) : Promise.resolve([]),
        canManage ? loadCountLog(supabase, event.id) : Promise.resolve([]),
        canPlan ? loadReservationZones(supabase, event.siteId) : Promise.resolve([]),
        canPlan ? loadReservationDefaults(supabase) : Promise.resolve([]),
        canPlan ? loadReservationOverrides(supabase, event.id) : Promise.resolve([]),
      ])
    : [[], [], [], [], [], [], []];
  const guide = guides.find((g) => g.day === event.day) ?? null;
  // Reservas de puestos de ese día en la sede, para quien planifica (las ve cualquiera que coordine, supervise o administre la sede).
  const seatReservations = canPlan && event.status === "programado" ? (await loadSeatReservations(supabase, event.date, event.date)).filter((r) => r.siteId === event.siteId) : [];
  const today = todayCo();
  const meetings = await loadEventMeetings(supabase, event);
  // Quien apoya no ve el nombre de un grupo ajeno con sus permisos normales.
  if (event.groupId && !event.groupName) event.groupName = ((await supabase.rpc("event_group_name", { p_event: event.id })).data as string | null) ?? null;

  // Secciones del servicio, en pestañas (la dirección ?tab= se puede compartir): posiciones, apoyos, conteos y administración.
  const live = event.status === "programado" && !!event.groupId;
  const pendingApps = applications.filter((a) => a.status === "pendiente").length;
  const tabs: TabItem[] = [
    ...(live ? [{ id: "posiciones", label: "Posiciones" }] : []),
    ...(live && canPlan && isNext ? [{ id: "apoyos", label: "Apoyos", badge: pendingApps }] : []),
    ...(live ? [{ id: "conteos", label: "Conteos" }] : []),
    ...(canManage ? [{ id: "administrar", label: "Administrar" }] : []),
  ];
  const tab = tabs.length ? pickTab(tabs, wanted) : "";

  return (
    <main className="space-y-6">
      <div>
        <p className="text-sm"><Link href="/servicio">← Mi servicio</Link></p>
        <h1 className="mt-1 text-2xl font-extrabold">{formatServiceDate(event.date)}</h1>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-muted">
          <span>{serviceLabel(event.day, event.shift)} · {event.siteName} · <strong className="text-fg">{event.groupName ?? "Sin grupo"}</strong></span>
          <StatusBadges e={event} />
        </p>
        {meetings.length > 0 && event.status === "programado" && (
          <div role="group" className="mt-2 flex flex-wrap items-center gap-2 text-sm" aria-label="Reuniones del servicio">
            <span className="font-semibold">Reuniones:</span>
            {meetings.map((m) => <span key={m.id} className="rounded-full border border-line bg-surface px-2.5 py-0.5 font-semibold">{formatMeetingTime(m.time)}{m.label ? ` · ${m.label}` : ""}</span>)}
            {event.meetingsCustom && <span className="text-xs font-bold text-muted">(personalizadas)</span>}
          </div>
        )}
        {event.note && <p className="mt-2 whitespace-pre-line rounded-lg border border-line bg-surface p-3 text-sm">{event.note}</p>}
      </div>

      {event.status === "cancelado" && (
        <p role="status" className="rounded-2xl border border-danger/60 bg-danger/10 p-4">
          Este servicio está cancelado{event.cancelReason ? `: ${event.cancelReason}` : ""}. Ese turno se pierde y la rotación sigue con el grupo de la semana siguiente.
        </p>
      )}

      {seatReservations.length > 0 && (
        <section aria-label="Reservas de puestos" className="space-y-2 rounded-2xl border-2 border-accent bg-surface p-4">
          <h2 className="text-lg font-extrabold">Reservas de puestos de este día</h2>
          <p className="text-sm text-muted">Puestos reservados: tenlos en cuenta al acomodar a las personas.</p>
          <ReservationList items={seatReservations} />
        </section>
      )}

      {tabs.length > 1 && <Tabs tabs={tabs} current={tab} base={`/servicio/${event.id}`} />}

      {tab === "administrar" && canManage && (
        <EventManage
          event={event}
          groups={groups.filter((g) => g.slotId === event.slotId)}
          hasPlan={plan.status !== null || plan.assignments.length > 0 || plan.files.length > 0}
          canAllSites={user.isAdmin || user.isHead}
          meetings={meetings}
        />
      )}

      {tab === "apoyos" && canPlan && isNext && <SupportPanel event={event} people={people} request={request} applications={applications} positions={positions} />}

      {tab === "conteos" && live && (
        <CountPanel eventId={event.id} date={event.date} day={event.day} locations={countLocations} counts={counts} guide={guide} canSeeCounts={canPlan} canCount={canPlan && canCountNow(event.date, today, canManage)} window={countWindow(event.date, today)} manager={canManage} log={countLog} zones={zones} reservationDefaults={rsvDefaults} reservations={rsvOverrides} />
      )}

      {tab === "posiciones" && live && (
        <>
          <PlanEditor event={event} positions={positions} people={people} plan={plan} canPlan={canPlan} meId={user.id} />
          <FilesPanel event={event} files={plan.files} canPlan={canPlan} />
        </>
      )}
    </main>
  );
}

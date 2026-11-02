import Link from "next/link";
import { ReserveDialog } from "@/components/reservations/ReserveDialog";
import { ReservationForm } from "@/components/reservations/ReservationForm";
import { ReservationList } from "@/components/reservations/ReservationList";
import { loadReserverMeetings, loadReserverZones, loadSeatReservations } from "@/lib/reservations/load";
import { loadMyCounterEntrances } from "@/lib/counter/load";
import { RecentAnnouncements } from "@/components/announcements/RecentAnnouncements";
import { loadAnnouncements } from "@/lib/announcements/load";
import { ActiveBadge } from "@/components/service/ActiveBadge";
import { TodayService } from "@/components/counts/TodayService";
import { loadCountLocations, loadCounts, loadGuides, loadReservationDefaults, loadReservationOverrides, loadReservationZones } from "@/lib/counts/load";
import { canCountNow, countWindow } from "@/lib/counts/window";
import { SupportRequests } from "@/components/support/SupportRequests";
import { serviceLabel } from "@/lib/labels";
import { loadActiveServices } from "@/lib/service/load-active";
import { formatServiceDate, todayCo } from "@/lib/service/dates";
import { loadOpenRequests } from "@/lib/support/load";
import { loadEvents } from "@/lib/service/load";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";

export default async function HomePage() {
  const user = await requireUser();

  const supabase = await createClient();

  // Rol «Reservas»: el cuadro para registrar reservas de puestos. Quien solo tiene ese rol no ve nada más.
  const manageSites = user.isAdmin || user.isHead || user.leaderSites.length > 0;   // pueden reservar por defecto, sin necesitar el rol «Reservas»
  const [reserverZones, myReservations, reserverMeetings] = user.reserverSites.length > 0 || manageSites
    ? await Promise.all([loadReserverZones(supabase), loadSeatReservations(supabase, todayCo()), loadReserverMeetings(supabase)])
    : [[], [], []];
  if (user.reserverOnly) {
    return (
      <main className="space-y-6">
        <div>
          <h1 className="text-2xl font-extrabold">Hola, {user.name.split(" ")[0]}</h1>
          <p className="mt-1 text-muted">
            <span className="mr-2 inline-block rounded-full bg-badge px-2.5 py-0.5 text-xs font-bold text-on-badge">{user.roleLabel}</span>
            {user.reserverSites.map((s) => s.name).join(", ")}
          </p>
        </div>
        <ReservationForm zones={reserverZones} mine={myReservations.filter((r) => r.mine)} today={todayCo()} meetings={reserverMeetings} />
      </main>
    );
  }
  const counterEntries = await loadMyCounterEntrances(supabase);
  const recent = (await loadAnnouncements(supabase, 30)).filter((a) => a.status === "active").slice(0, 3);
  const requests = (await loadOpenRequests(supabase)).slice(0, 3);
  const nextService = user.membership
    ? (await loadEvents(supabase, { from: todayCo(), groupId: user.membership.groupId, limit: 6 })).find((e) => e.status === "programado")
    : undefined;

  // Coordinadores, supervisores, líderes de sede, cabeza y administrador: atajos a su servicio activo, los conteos y el manual de su sede.
  const shortcuts = user.isAdmin || user.isHead || user.leaderSites.length > 0 || (!!user.membership && ["coordinador", "supervisor"].includes(user.membership.role));
  const active = shortcuts ? (await loadActiveServices(supabase, user, todayCo())).slice(0, 3) : [];
  // El día del servicio, el coordinador y el supervisor del grupo tienen a mano la guía, el manual y los conteos con las reservas.
  const todayItem = user.membership && ["coordinador", "supervisor"].includes(user.membership.role) ? active.find((a) => a.isToday && a.kind === "grupo") : undefined;
  const todayData = todayItem && user.membership
    ? await Promise.all([
        loadGuides(supabase, user.membership.site.id),
        loadCountLocations(supabase, user.membership.site.id),
        loadCounts(supabase, [todayItem.eventId]),
        loadReservationZones(supabase, user.membership.site.id),
        loadReservationDefaults(supabase),
        loadReservationOverrides(supabase, todayItem.eventId),
      ])
    : null;
  // Reservas de puestos de hoy para tener en cuenta durante el servicio (coordinadores, supervisores, líderes, cabeza y administrador).
  const todayReservations = shortcuts ? await loadSeatReservations(supabase, todayCo(), todayCo()) : [];
  const manuals = user.isAdmin || user.isHead
    ? [{ href: "/manual", label: "Manual de logística", hint: "Todas las sedes" }]
    : user.leaderSites.length
      ? user.leaderSites.map((s) => ({ href: `/manual/${s.slug}`, label: `Manual de ${s.name}`, hint: "Mapas, posiciones y flujos" }))
      : user.membership
        ? [{ href: `/manual/${user.membership.site.slug}`, label: `Manual de ${user.membership.site.name}`, hint: "Mapas, posiciones y flujos" }]
        : [];

  const scope = user.isAdmin || user.isHead
    ? "Todas las sedes"
    : user.leaderSites.length
      ? user.leaderSites.map((s) => s.name).join(", ")
      : user.membership?.site.name;

  return (
    <main className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">Hola, {user.name.split(" ")[0]}</h1>
        <p className="mt-1 text-muted">
          <span className="mr-2 inline-block rounded-full bg-badge px-2.5 py-0.5 text-xs font-bold text-on-badge">{user.roleLabel}</span>
          {scope}
        </p>
      </div>

      {counterEntries.length > 0 && (
        <section aria-label="Contador de entradas" className="space-y-2 rounded-2xl border-2 border-accent bg-surface p-4">
          <h2 className="text-lg font-extrabold">Hoy cuentas la entrada</h2>
          <ul className="space-y-2">
            {counterEntries.slice(0, 4).map((e) => (
              <li key={`${e.eventId}-${e.entranceId}`}>
                <Link href={`/contador/${e.eventId}/${e.entranceId}`} className="block rounded-xl bg-primary p-4 text-center text-lg font-extrabold !text-on-primary no-underline hover:brightness-105">
                  🔢 Contar: {e.entranceName} <span className="block text-sm font-normal">{e.locationName} · {e.siteName}</span>
                </Link>
              </li>
            ))}
          </ul>
          {counterEntries.length > 4 && <p className="text-sm"><Link href="/contador">Ver todas las entradas →</Link></p>}
        </section>
      )}

      {user.reserverSites.length > 0 && !manageSites && <ReservationForm zones={reserverZones} mine={myReservations.filter((r) => r.mine)} today={todayCo()} meetings={reserverMeetings} />}

      {shortcuts && (
        <section aria-label="Atajos" className="space-y-3">
          {todayItem && todayData && user.membership && (
            <TodayService
              eventId={todayItem.eventId} date={todayItem.date} day={todayItem.day} shift={todayItem.shift} siteName={todayItem.siteName} groupName={todayItem.groupName}
              manualHref={`/manual/${user.membership.site.slug}`}
              guide={todayData[0].find((g) => g.day === todayItem.day) ?? null}
              panel={{
                eventId: todayItem.eventId, date: todayItem.date, day: todayItem.day, locations: todayData[1], counts: todayData[2],
                canCount: canCountNow(todayItem.date, todayCo(), false), window: countWindow(todayItem.date, todayCo()), manager: false, canSeeCounts: true, log: [],
                zones: todayData[3], reservationDefaults: todayData[4], reservations: todayData[5],
              }}
            />
          )}
          {todayReservations.length > 0 && (
            <section aria-label="Reservas de hoy" className="space-y-2 rounded-2xl border-2 border-accent bg-surface p-4">
              <h2 className="text-lg font-extrabold">Reservas de puestos de hoy</h2>
              <p className="text-sm text-muted">Puestos que están reservados: tenlos en cuenta al acomodar.</p>
              <ReservationList items={todayReservations} showSite={new Set(todayReservations.map((r) => r.siteId)).size > 1} ariaLabel="Reservas de puestos de hoy" />
            </section>
          )}
          <div className="space-y-3" aria-label="Servicio activo">
            <h2 className="text-lg font-extrabold">Tu servicio activo</h2>
            {active.length === 0 ? (
              <p className="rounded-2xl border border-line bg-surface p-4 text-muted">No hay un servicio activo ahora. <Link href="/servicio" className="font-semibold">Ver Mi servicio →</Link></p>
            ) : (
              <ul className="space-y-2">
                {active.map((a) => (
                  <li key={a.eventId}>
                    <Link href={`/servicio/${a.eventId}`} className="block rounded-2xl border-2 border-accent bg-surface p-4 no-underline hover:brightness-105">
                      <span className="flex flex-wrap items-center gap-2"><ActiveBadge today={a.isToday} />{a.kind === "apoyo" && <span className="rounded-full bg-info px-2 py-0.5 text-xs font-bold text-on-info">Apoyo</span>}</span>
                      <span className="mt-1.5 block text-lg font-bold text-fg">{formatServiceDate(a.date)}</span>
                      <span className="block text-sm text-muted">{serviceLabel(a.day, a.shift)} · {a.siteName}{a.groupName ? ` · ${a.kind === "apoyo" ? "Apoyo a " : ""}${a.groupName}` : ""}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" role="group" aria-label="Accesos rápidos">
            {manageSites && <ReserveDialog zones={reserverZones} mine={myReservations.filter((r) => r.mine)} today={todayCo()} meetings={reserverMeetings} canManage />}
            <Link href="/conteos" className="block rounded-2xl border border-line bg-surface p-4 no-underline hover:border-primary">
              <span className="text-lg font-bold text-fg">Conteos</span>
              <span className="mt-1 block text-sm text-muted">Registrar y revisar cuántas personas entraron.</span>
            </Link>
            <Link href="/contador" className="block rounded-2xl border border-line bg-surface p-4 no-underline hover:border-primary">
              <span className="text-lg font-bold text-fg">Contador digital</span>
              <span className="mt-1 block text-sm text-muted">Contar con el botón grande, en pantalla completa (el día del servicio).</span>
            </Link>
            {manuals.map((m) => (
              <Link key={m.href} href={m.href} className="block rounded-2xl border border-line bg-surface p-4 no-underline hover:border-primary">
                <span className="text-lg font-bold text-fg">{m.label}</span>
                <span className="mt-1 block text-sm text-muted">{m.hint}</span>
              </Link>
            ))}
            <Link href="/servicio" className="block rounded-2xl border border-line bg-surface p-4 no-underline hover:border-primary">
              <span className="text-lg font-bold text-fg">Mi servicio</span>
              <span className="mt-1 block text-sm text-muted">Servicios activos, apoyos y posiciones.</span>
            </Link>
          </div>
        </section>
      )}

      {user.membership ? (
        <section className="rounded-2xl border border-line bg-surface p-5">
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted">Mi grupo</h2>
          <p className="mt-1 text-xl font-bold">{user.membership.groupName}</p>
          <p className="text-muted">{user.membership.service} · {user.membership.site.name}</p>
          <p className="mt-3 text-sm">
            {nextService
              ? <>Próximo servicio: <Link href={`/servicio/${nextService.id}`} className="font-semibold">{formatServiceDate(nextService.date)}</Link></>
              : <Link href="/servicio" className="font-semibold">Ver mi servicio →</Link>}
          </p>
        </section>
      ) : (
        <section className="rounded-2xl border border-line bg-surface p-5 text-muted">
          No perteneces a un grupo de servicio{user.isAdmin || user.isHead || user.leaderSites.length ? " (tu rol acompaña a los grupos)." : ". Pide a tu coordinador que te agregue."}
        </section>
      )}

      {requests.length > 0 && (
        <section aria-label="Solicitudes de apoyo" className="space-y-3">
          <h2 className="text-lg font-extrabold">Piden apoyo en tu sede</h2>
          <SupportRequests requests={requests} compact />
        </section>
      )}

      <section aria-label="Novedades recientes" className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-lg font-extrabold">Novedades recientes</h2>
          <Link href="/novedades" className="text-sm font-semibold">Ver todas →</Link>
        </div>
        {recent.length === 0 ? (
          <p className="rounded-2xl border border-line bg-surface p-5 text-muted">No hay novedades por ahora.</p>
        ) : (
          <RecentAnnouncements items={recent} />
        )}
      </section>

      {(user.membership || user.canManagePeople) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {user.membership && (
            <Link href="/grupo" className="block rounded-2xl border border-line bg-surface p-5 no-underline hover:border-primary">
              <span className="text-lg font-bold text-fg">Mi grupo</span>
              <span className="mt-1 block text-sm text-muted">Quiénes servimos juntos en {user.membership.groupName}.</span>
            </Link>
          )}
          {user.canManagePeople && (
            <Link href="/personas" className="block rounded-2xl border border-line bg-surface p-5 no-underline hover:border-primary">
              <span className="text-lg font-bold text-fg">Personas</span>
              <span className="mt-1 block text-sm text-muted">Agrega correos para que entren con Google y administra a tu equipo.</span>
            </Link>
          )}
        </div>
      )}

      <Link href="/manual" className="block rounded-2xl bg-primary p-5 !text-on-primary no-underline shadow hover:brightness-110">
        <span className="text-lg font-extrabold">Ver el manual de logística</span>
        <span className="mt-1 block text-sm opacity-90">Mapas, posiciones e indicaciones de tu sede.</span>
      </Link>
    </main>
  );
}

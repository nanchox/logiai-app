import Link from "next/link";
import { AnnouncementCard } from "@/components/announcements/AnnouncementCard";
import { loadAnnouncements } from "@/lib/announcements/load";
import { ActiveBadge } from "@/components/service/ActiveBadge";
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
  const recent = (await loadAnnouncements(supabase, 30)).filter((a) => a.status === "active").slice(0, 3);
  const requests = (await loadOpenRequests(supabase)).slice(0, 3);
  const nextService = user.membership
    ? (await loadEvents(supabase, { from: todayCo(), groupId: user.membership.groupId, limit: 6 })).find((e) => e.status === "programado")
    : undefined;

  // Coordinadores, supervisores, líderes de sede, cabeza y administrador: atajos a su servicio activo, los conteos y el manual de su sede.
  const shortcuts = user.isAdmin || user.isHead || user.leaderSites.length > 0 || (!!user.membership && ["coordinador", "supervisor"].includes(user.membership.role));
  const active = shortcuts ? (await loadActiveServices(supabase, user, todayCo())).slice(0, 3) : [];
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

      {shortcuts && (
        <section aria-label="Atajos" className="space-y-3">
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
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Accesos rápidos">
            <Link href="/conteos" className="block rounded-2xl border border-line bg-surface p-4 no-underline hover:border-primary">
              <span className="text-lg font-bold text-fg">Conteos</span>
              <span className="mt-1 block text-sm text-muted">Registrar y revisar cuántas personas entraron.</span>
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
          <ul className="space-y-3">
            {recent.map((a) => <li key={a.id}><AnnouncementCard a={a} compact /></li>)}
          </ul>
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

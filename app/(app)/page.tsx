import Link from "next/link";
import { AnnouncementCard } from "@/components/announcements/AnnouncementCard";
import { loadAnnouncements } from "@/lib/announcements/load";
import { formatServiceDate, todayCo } from "@/lib/service/dates";
import { loadEvents } from "@/lib/service/load";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";

export default async function HomePage() {
  const user = await requireUser();

  const supabase = await createClient();
  const recent = (await loadAnnouncements(supabase, 30)).filter((a) => a.status === "active").slice(0, 3);
  const nextService = user.membership
    ? (await loadEvents(supabase, { from: todayCo(), groupId: user.membership.groupId, limit: 6 })).find((e) => e.status === "programado")
    : undefined;

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
          <span className="mr-2 inline-block rounded-full bg-bronze px-2.5 py-0.5 text-xs font-bold text-on-bronze">{user.roleLabel}</span>
          {scope}
        </p>
      </div>

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

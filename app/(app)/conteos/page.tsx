import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Delta, SiteReportView } from "@/components/counts/CountReportView";
import { requireUser } from "@/lib/auth";
import { loadCountLocations, loadWeek } from "@/lib/counts/load";
import { buildSiteReport, weekTotal } from "@/lib/counts/report";
import { loadSites } from "@/lib/people/load";
import { addDays, formatServiceDateShort, isDate, mondayOf, todayCo } from "@/lib/service/dates";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Conteos" };

export default async function CountsPage({ searchParams }: PageProps<"/conteos">) {
  const user = await requireUser();
  const manager = user.isAdmin || user.isHead || user.leaderSites.length > 0;
  const planner = !!user.membership && ["coordinador", "supervisor"].includes(user.membership.role);
  if (!manager && !planner) redirect("/");

  const today = todayCo();
  const { semana } = await searchParams;
  const monday = typeof semana === "string" && isDate(semana) ? mondayOf(semana) : mondayOf(today);

  const supabase = await createClient();
  const [sites, locations, week] = await Promise.all([loadSites(supabase), loadCountLocations(supabase), loadWeek(supabase, monday)]);
  const reports = sites
    .map((s) => ({ site: s, report: buildSiteReport(s.id, s.name, week.events, week.counts, locations, today), prev: weekTotal(s.id, week.prevEvents, week.prevCounts) }))
    .filter((r) => r.report.days.length > 0 || manager);
  const grand = reports.reduce((s, r) => s + r.report.total, 0);
  const grandPrev = reports.reduce((s, r) => s + r.prev, 0);

  return (
    <main className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">Conteos</h1>
        <p className="mt-1 text-muted">Cuántas personas entraron en cada servicio, por ubicación, día y semana, frente a la capacidad.</p>
        {manager && <p className="mt-2 text-sm"><Link href="/conteos/configurar">Capacidad y guías de conteo →</Link></p>}
      </div>

      <nav aria-label="Semana" className="flex flex-wrap items-center gap-2">
        <Link href={`/conteos?semana=${addDays(monday, -7)}`} className="rounded-lg border border-line bg-surface px-3 py-2 text-sm font-semibold no-underline hover:border-primary">← Semana anterior</Link>
        <span className="px-2 font-bold" aria-live="polite">{formatServiceDateShort(monday)} – {formatServiceDateShort(addDays(monday, 6))}</span>
        <Link href={`/conteos?semana=${addDays(monday, 7)}`} className="rounded-lg border border-line bg-surface px-3 py-2 text-sm font-semibold no-underline hover:border-primary">Semana siguiente →</Link>
        {monday !== mondayOf(today) && <Link href="/conteos" className="text-sm font-semibold">Esta semana</Link>}
      </nav>

      {reports.length > 1 && (
        <section aria-label="Total de todas las sedes" className="rounded-2xl border border-accent bg-surface p-5">
          <p className="text-sm font-bold uppercase tracking-wider text-muted">Todas las sedes</p>
          <p className="text-3xl font-extrabold">{grand.toLocaleString("es-CO")} <span className="text-base font-semibold text-muted">personas en la semana</span></p>
          <p className="text-sm"><Delta now={grand} before={grandPrev} /></p>
        </section>
      )}

      {reports.length === 0
        ? <p className="rounded-2xl border border-line bg-surface p-5 text-muted">No hay servicios de tus grupos esta semana.</p>
        : reports.map((r) => <SiteReportView key={r.site.id} report={r.report} prevTotal={r.prev} />)}
    </main>
  );
}

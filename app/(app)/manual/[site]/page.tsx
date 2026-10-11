import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { LocationTools, NewLocation } from "@/components/manual/LocationAdmin";
import { getCurrentUser } from "@/lib/auth";
import { LOCATION_KIND_LABEL } from "@/lib/labels";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata({ params }: PageProps<"/manual/[site]">): Promise<Metadata> {
  const { site } = await params;
  return { title: `Manual ${site}` };
}

export default async function SitePage({ params }: PageProps<"/manual/[site]">) {
  const { site: slug } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const supabase = await createClient();

  const { data: site } = await supabase.from("sites").select("id, name").eq("slug", slug).maybeSingle();
  if (!site) notFound();

  const [{ data: locations }, { count: flowCount }] = await Promise.all([
    supabase.from("locations").select("id, name, kind, manual_url, sort").eq("site_id", site.id).order("sort").order("name"),
    supabase.from("flows").select("id", { count: "exact", head: true }).eq("site_id", site.id),
  ]);
  const canManage = user.isAdmin || user.isHead || user.leaderSites.some((s) => s.id === site.id);

  return (
    <main className="space-y-6">
      <div>
        <p className="text-sm text-muted"><Link href="/manual">Manual</Link> / {site.name}</p>
        <h1 className="mt-1 text-2xl font-extrabold">{site.name}</h1>
      </div>

      <Link href={`/manual/${slug}/flujos`} className="block rounded-2xl border border-accent/70 bg-surface p-5 no-underline hover:border-accent">
        <span className="text-lg font-bold text-fg">Flujos de ubicación</span>
        <span className="mt-1 block text-sm text-muted">
          Qué hacer cuando se llena el auditorio principal: a dónde enviar a la gente y en qué orden.
          {flowCount ? ` · ${flowCount} flujo${flowCount > 1 ? "s" : ""}` : ""}
        </span>
      </Link>

      <section aria-label="Espacios">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-muted">Auditorios y espacios</h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(locations ?? []).map((l) => (
            <li key={l.id} className="rounded-2xl border border-line bg-surface p-5">
              <Link href={`/manual/${slug}/${l.id}`} className="text-lg font-bold no-underline">{l.name}</Link>
              <p className="text-sm text-muted">{LOCATION_KIND_LABEL[l.kind] ?? l.kind}</p>
              {l.manual_url && (
                <a href={l.manual_url.replace("/embed", "/edit")} target="_blank" rel="noreferrer noopener" className="mt-2 inline-block text-sm">
                  Manual en presentación ↗
                </a>
              )}
              {canManage && <LocationTools siteId={site.id} location={{ id: l.id, name: l.name, kind: l.kind, manualUrl: l.manual_url }} />}
            </li>
          ))}
        </ul>
        {!locations?.length && <p className="text-muted">Esta sede todavía no tiene espacios.</p>}
        {canManage && <div className="mt-4"><NewLocation siteId={site.id} nextSort={(locations?.at(-1)?.sort ?? 0) + 1} /></div>}
      </section>
    </main>
  );
}

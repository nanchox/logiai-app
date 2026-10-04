import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ManualClient } from "@/components/manual/ManualClient";
import { getCurrentUser } from "@/lib/auth";
import { loadLocation } from "@/lib/manual/load";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Mapa" };

export default async function LocationPage({ params }: PageProps<"/manual/[site]/[location]">) {
  const { site: slug, location: locationId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(locationId)) notFound();

  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const { data: location } = await supabase
    .from("locations")
    .select("id, name, site_id, sites!inner(slug, name)")
    .eq("id", locationId)
    .maybeSingle();
  const site = (location as unknown as { sites: { slug: string; name: string } } | null)?.sites;
  if (!location || !site || site.slug !== slug) notFound();

  const canManage = user.isAdmin || user.isHead || user.leaderSites.some((s) => s.id === location.site_id);
  const data = await loadLocation(supabase, location.id, canManage);

  // Por defecto se muestra el día y la franja del grupo del usuario, si sirve en esta sede.
  const m = user.membership && user.membership.site.slug === slug ? user.membership : null;

  return (
    <main>
      <p className="text-sm text-muted">
        <Link href="/manual">Manual</Link> / <Link href={`/manual/${slug}`}>{site.name}</Link> / {location.name}
      </p>
      <h1 className="mb-4 mt-1 text-2xl font-extrabold">{location.name}</h1>
      <ManualClient
        siteSlug={slug}
        locationId={location.id}
        canManage={canManage}
        {...data}
        defaultDay={m?.day ?? "all"}
        defaultShift={m?.shift ?? "all"}
      />
    </main>
  );
}

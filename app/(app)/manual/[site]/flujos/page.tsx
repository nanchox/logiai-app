import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { FlowsClient, type FlowItem } from "@/components/manual/FlowsClient";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Flujos de ubicación" };

export default async function FlowsPage({ params }: PageProps<"/manual/[site]/flujos">) {
  const { site: slug } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const supabase = await createClient();

  const { data: site } = await supabase.from("sites").select("id, name").eq("slug", slug).maybeSingle();
  if (!site) notFound();

  const [flowsRes, stepsRes, locsRes] = await Promise.all([
    supabase.from("flows").select("id, name, description, sort").eq("site_id", site.id).order("sort").order("name"),
    supabase.from("flow_steps").select("id, flow_id, step_order, location_id, title, instructions, flows!inner(site_id)").eq("flows.site_id", site.id).order("step_order"),
    supabase.from("locations").select("id, name").eq("site_id", site.id).order("sort"),
  ]);

  const steps = stepsRes.data ?? [];
  const flows: FlowItem[] = (flowsRes.data ?? []).map((f) => ({
    id: f.id,
    name: f.name,
    description: f.description,
    steps: steps.filter((s) => s.flow_id === f.id).map((s) => ({ id: s.id, locationId: s.location_id, title: s.title, instructions: s.instructions })),
  }));
  const canManage = user.isAdmin || user.isHead || user.leaderSites.some((s) => s.id === site.id);

  return (
    <main>
      <p className="text-sm text-muted"><Link href="/manual">Manual</Link> / <Link href={`/manual/${slug}`}>{site.name}</Link> / Flujos</p>
      <h1 className="mb-1 mt-1 text-2xl font-extrabold">Flujos de ubicación</h1>
      <p className="mb-5 text-muted">Qué hacer cuando se llena el auditorio principal, paso a paso.</p>
      <FlowsClient siteId={site.id} siteSlug={slug} canManage={canManage} flows={flows} locations={locsRes.data ?? []} />
    </main>
  );
}

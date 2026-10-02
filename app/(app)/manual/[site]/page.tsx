import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LOCATION_KIND_LABEL } from "@/lib/labels";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata({ params }: PageProps<"/manual/[site]">): Promise<Metadata> {
  const { site } = await params;
  return { title: `Manual ${site}` };
}

export default async function SitePage({ params }: PageProps<"/manual/[site]">) {
  const { site: slug } = await params;
  const supabase = await createClient();

  const { data: site } = await supabase.from("sites").select("id, name").eq("slug", slug).maybeSingle();
  if (!site) notFound();

  const { data: locations } = await supabase
    .from("locations")
    .select("id, name, kind, manual_url")
    .eq("site_id", site.id)
    .order("sort");

  return (
    <main>
      <p className="text-sm text-muted"><Link href="/manual">Manual</Link> / {site.name}</p>
      <h1 className="mb-4 mt-1 text-2xl font-extrabold">{site.name}</h1>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(locations ?? []).map((l) => (
          <li key={l.id} className="rounded-2xl border border-line bg-surface p-5">
            <Link href={`/manual/${slug}/${l.id}`} className="text-lg font-bold no-underline">{l.name}</Link>
            <p className="text-sm text-muted">{LOCATION_KIND_LABEL[l.kind] ?? l.kind}</p>
            {l.manual_url && (
              <a href={l.manual_url.replace("/embed", "/edit")} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm">
                Manual en presentación ↗
              </a>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}

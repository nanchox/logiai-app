import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Manual" };

export default async function ManualPage() {
  const supabase = await createClient();
  // RLS ya limita las sedes a las que el usuario puede ver.
  const { data: sites } = await supabase.from("sites").select("slug, name").order("sort");

  if (!sites?.length) {
    return <p className="text-muted">Todavía no hay un manual disponible para tu sede.</p>;
  }
  if (sites.length === 1) redirect(`/manual/${sites[0].slug}`);

  return (
    <main>
      <h1 className="mb-4 text-2xl font-extrabold">Manual · Sedes</h1>
      <ul className="grid gap-3 sm:grid-cols-2">
        {sites.map((s) => (
          <li key={s.slug}>
            <Link href={`/manual/${s.slug}`} className="block rounded-2xl border border-line bg-surface p-5 text-lg font-bold no-underline hover:border-primary">
              {s.name}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}

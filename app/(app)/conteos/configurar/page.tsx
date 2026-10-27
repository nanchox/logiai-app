import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CountConfig } from "@/components/counts/CountConfig";
import { requireUser } from "@/lib/auth";
import { loadCountLocations, loadGuides } from "@/lib/counts/load";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Capacidad y guías de conteo" };

export default async function CountConfigPage() {
  const user = await requireUser();
  if (!user.canManageGroups) redirect("/conteos");

  const supabase = await createClient();
  const [{ data: sites }, locations, guides] = await Promise.all([
    supabase.from("sites").select("id, slug, name").order("sort"),
    loadCountLocations(supabase),
    loadGuides(supabase),
  ]);
  const mine = (sites ?? []).filter((s) => user.isAdmin || user.isHead || user.leaderSites.some((l) => l.id === s.id));

  return (
    <main className="space-y-6">
      <div>
        <p className="text-sm"><Link href="/conteos">← Conteos</Link></p>
        <h1 className="mt-1 text-2xl font-extrabold">Capacidad y guías de conteo</h1>
        <p className="mt-1 text-muted">Registra cuántas sillas tiene cada ubicación y carga, por día de la semana, la imagen que indica cómo contar en cada entrada.</p>
      </div>
      <CountConfig sites={mine} locations={locations} guides={guides} />
    </main>
  );
}

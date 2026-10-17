import type { Metadata } from "next";
import { AnnouncementsClient } from "@/components/announcements/AnnouncementsClient";
import { requireUser } from "@/lib/auth";
import { loadAnnouncements } from "@/lib/announcements/load";
import { loadGroups, loadSites, viewerOf } from "@/lib/people/load";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Anuncios" };

export default async function AnnouncementsPage() {
  const user = await requireUser();
  const viewer = viewerOf(user);
  const supabase = await createClient();
  const [items, sites, groups] = await Promise.all([
    loadAnnouncements(supabase),
    viewer ? loadSites(supabase) : Promise.resolve([]),
    viewer ? loadGroups(supabase) : Promise.resolve([]),
  ]);

  return (
    <main>
      <h1 className="mb-1 text-2xl font-extrabold">Anuncios</h1>
      <p className="mb-5 text-muted">Noticias, cambios y avisos para tu sede, tu día y tu grupo.</p>
      <AnnouncementsClient items={items} viewer={viewer} sites={sites} groups={groups} />
    </main>
  );
}

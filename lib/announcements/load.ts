import type { SupabaseClient } from "@supabase/supabase-js";
import { slotWhen, type AnnouncementItem, type Category, type Status } from "./types";

type Row = {
  id: string; title: string; body: string; category: Category;
  site_id: string | null; day: string | null; group_id: string | null; pinned: boolean;
  starts_at: string; ends_at: string | null; created_at: string; author_name: string | null; author_role: string | null;
  sites: { name: string } | null;
  groups: { name: string; service_slots: { day: string; shift: string } } | null;
  announcement_links: { id: string; label: string; url: string; sort: number }[];
};

/** Novedades que el usuario puede ver (la base de datos filtra por alcance y vigencia), fijados primero y luego los más recientes. */
export async function loadAnnouncements(supabase: SupabaseClient, limit = 100): Promise<AnnouncementItem[]> {
  const { data } = await supabase
    .from("announcements")
    .select(
      "id, title, body, category, site_id, day, group_id, pinned, starts_at, ends_at, created_at, author_name, author_role, " +
      "sites(name), groups(name, service_slots(day, shift)), announcement_links(id, label, url, sort)",
    )
    .order("pinned", { ascending: false })
    .order("starts_at", { ascending: false })
    .limit(limit);

  const now = Date.now();
  return ((data ?? []) as unknown as Row[]).map((r) => {
    const status: Status = new Date(r.starts_at).getTime() > now ? "scheduled" : r.ends_at && new Date(r.ends_at).getTime() <= now ? "expired" : "active";
    return {
      id: r.id, title: r.title, body: r.body, category: r.category,
      siteId: r.site_id, siteName: r.sites?.name ?? null, day: r.day,
      groupId: r.group_id, groupName: r.groups?.name ?? null, groupWhen: r.groups ? slotWhen(r.groups.service_slots.day, r.groups.service_slots.shift) : null,
      pinned: r.pinned, startsAt: r.starts_at, endsAt: r.ends_at, createdAt: r.created_at,
      authorName: r.author_name, authorRole: r.author_role,
      links: [...r.announcement_links].sort((a, b) => a.sort - b.sort).map(({ id, label, url }) => ({ id, label, url })),
      status,
    };
  });
}

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentUser } from "@/lib/auth";
import type { GroupItem, GroupRole, InviteItem, MemberItem, SiteItem, SlotItem, Viewer } from "./types";

const DAY_ORDER: Record<string, number> = { miercoles: 0, sabado: 1, domingo: 2 };
const SHIFT_ORDER: Record<string, number> = { am: 0, pm: 1, unica: 2 };
const naturalCompare = (a: string, b: string) => a.localeCompare(b, "es", { numeric: true });

export function viewerOf(user: CurrentUser): Viewer | null {
  if (user.isAdmin) return { userId: user.id, kind: "admin", siteIds: [], groupId: null };
  if (user.isHead) return { userId: user.id, kind: "head", siteIds: [], groupId: null };
  if (user.leaderSites.length) return { userId: user.id, kind: "leader", siteIds: user.leaderSites.map((s) => s.id), groupId: null };
  if (user.membership?.role === "coordinador") return { userId: user.id, kind: "coordinator", siteIds: [user.membership.site.id], groupId: user.membership.groupId };
  return null;
}

/** Sedes visibles para el usuario (la base de datos ya filtra por rol). */
export async function loadSites(supabase: SupabaseClient): Promise<SiteItem[]> {
  const { data } = await supabase.from("sites").select("id, slug, name").order("sort");
  return data ?? [];
}

export async function loadSlots(supabase: SupabaseClient): Promise<SlotItem[]> {
  const { data } = await supabase.from("service_slots").select("id, site_id, day, shift, arrival_time, start_time, end_time");
  return (data ?? [])
    .map((s) => ({ id: s.id, siteId: s.site_id, day: s.day, shift: s.shift, arrival: s.arrival_time, start: s.start_time, end: s.end_time }))
    .sort((a, b) => DAY_ORDER[a.day] - DAY_ORDER[b.day] || SHIFT_ORDER[a.shift] - SHIFT_ORDER[b.shift]);
}

/** Grupos que el usuario puede ver, ordenados por sede, día, franja y nombre, con su número de integrantes. */
export async function loadGroups(supabase: SupabaseClient): Promise<GroupItem[]> {
  const { data } = await supabase
    .from("groups")
    .select("id, name, service_slot_id, memberships(count), service_slots(day, shift, site_id, sites(name, sort))");
  type Row = {
    id: string; name: string; service_slot_id: string; memberships: { count: number }[];
    service_slots: { day: string; shift: string; site_id: string; sites: { name: string; sort: number } };
  };
  return ((data ?? []) as unknown as Row[])
    .sort((a, b) =>
      a.service_slots.sites.sort - b.service_slots.sites.sort ||
      DAY_ORDER[a.service_slots.day] - DAY_ORDER[b.service_slots.day] ||
      SHIFT_ORDER[a.service_slots.shift] - SHIFT_ORDER[b.service_slots.shift] ||
      naturalCompare(a.name, b.name))
    .map((g) => ({
      id: g.id, name: g.name, slotId: g.service_slot_id, siteId: g.service_slots.site_id, siteName: g.service_slots.sites.name,
      day: g.service_slots.day, shift: g.service_slots.shift, memberCount: g.memberships[0]?.count ?? 0,
    }));
}

type MemberRow = {
  user_id: string; role: GroupRole; group_id: string;
  profiles: { full_name: string | null; avatar_url: string | null; profile_private: { email: string } | null } | null;
};

/** Integrantes de un grupo. El correo solo llega si la base de datos permite verlo (lo decide RLS, no la interfaz). */
export async function loadMembers(supabase: SupabaseClient, groupId: string): Promise<MemberItem[]> {
  const { data } = await supabase
    .from("memberships")
    .select("user_id, role, group_id, profiles(full_name, avatar_url, profile_private(email))")
    .eq("group_id", groupId);
  const order: Record<string, number> = { coordinador: 0, supervisor: 1, voluntario: 2 };
  return ((data ?? []) as unknown as MemberRow[])
    .map((m) => ({
      userId: m.user_id, role: m.role, groupId: m.group_id,
      name: m.profiles?.full_name ?? "Integrante", avatarUrl: m.profiles?.avatar_url ?? null,
      email: m.profiles?.profile_private?.email ?? null,
    }))
    .sort((a, b) => order[a.role] - order[b.role] || naturalCompare(a.name, b.name));
}

/** Invitaciones pendientes de un grupo (quien no puede administrarlas no recibe ninguna). */
export async function loadInvites(supabase: SupabaseClient, groupId: string): Promise<InviteItem[]> {
  const { data } = await supabase
    .from("invitations")
    .select("id, email, group_role, group_id, created_at")
    .eq("group_id", groupId)
    .is("accepted_at", null)
    .order("created_at", { ascending: false });
  return (data ?? []).map((i) => ({ id: i.id, email: i.email, role: i.group_role, groupId: i.group_id, createdAt: i.created_at }));
}

// ───────────── Líderes y administración (solo cabeza y admin) ─────────────
export type LeaderItem = { userId: string; name: string; email: string | null; sites: SiteItem[] };
export type AdminItem = { userId: string; name: string; email: string | null; isAdmin: boolean; isHead: boolean };
export type PendingStaff = { id: string; email: string; label: string; createdAt: string };

export async function loadLeaders(supabase: SupabaseClient, sites: SiteItem[]): Promise<{ leaders: LeaderItem[]; admins: AdminItem[]; pending: PendingStaff[] }> {
  const [leadersRes, adminsRes, pendingRes] = await Promise.all([
    supabase.from("site_leaders").select("user_id, site_id, profiles(full_name, profile_private(email))"),
    supabase.from("profiles").select("user_id, full_name, is_admin, is_head, profile_private(email)").or("is_admin.eq.true,is_head.eq.true"),
    supabase.from("invitations").select("id, email, is_admin, is_head, leader_site_ids, created_at").is("accepted_at", null).or("is_admin.eq.true,is_head.eq.true,leader_site_ids.neq.{}").order("created_at", { ascending: false }),
  ]);
  const siteById = new Map(sites.map((s) => [s.id, s]));

  type LRow = { user_id: string; site_id: string; profiles: { full_name: string | null; profile_private: { email: string } | null } | null };
  const byUser = new Map<string, LeaderItem>();
  for (const r of (leadersRes.data ?? []) as unknown as LRow[]) {
    const item = byUser.get(r.user_id) ?? { userId: r.user_id, name: r.profiles?.full_name ?? "Líder", email: r.profiles?.profile_private?.email ?? null, sites: [] };
    const site = siteById.get(r.site_id);
    if (site) item.sites.push(site);
    byUser.set(r.user_id, item);
  }

  type ARow = { user_id: string; full_name: string | null; is_admin: boolean; is_head: boolean; profile_private: { email: string } | null };
  const admins = ((adminsRes.data ?? []) as unknown as ARow[]).map((a) => ({ userId: a.user_id, name: a.full_name ?? "Sin nombre", email: a.profile_private?.email ?? null, isAdmin: a.is_admin, isHead: a.is_head }));

  const pending = (pendingRes.data ?? []).map((i) => ({
    id: i.id,
    email: i.email,
    createdAt: i.created_at,
    label: i.is_admin ? "Administrador" : i.is_head ? "Cabeza de ministerio" : `Líder de ${(i.leader_site_ids as string[]).map((id) => siteById.get(id)?.name ?? "sede").join(", ")}`,
  }));
  return { leaders: [...byUser.values()].sort((a, b) => naturalCompare(a.name, b.name)), admins, pending };
}

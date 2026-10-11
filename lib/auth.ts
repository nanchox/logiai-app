import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { GROUP_ROLE_LABEL, serviceLabel } from "@/lib/labels";

export type Site = { id: string; slug: string; name: string };

export type CurrentUser = {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  isAdmin: boolean;
  isHead: boolean;
  leaderSites: Site[];
  membership: { role: string; groupName: string; service: string; day: string; shift: string; site: Site } | null;
  /** Etiqueta principal del rol, para mostrar en la interfaz. */
  roleLabel: string;
};

type MembershipRow = {
  role: string;
  groups: {
    name: string;
    service_slots: { day: string; shift: string; sites: Site };
  };
};

/**
 * Usuario autenticado con su perfil y rol. Los permisos reales los aplica RLS;
 * esto solo sirve para decidir qué mostrar.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;

  const [profileRes, leadersRes, membershipRes] = await Promise.all([
    supabase.from("profiles").select("email, full_name, avatar_url, is_admin, is_head").eq("user_id", auth.user.id).maybeSingle(),
    supabase.from("site_leaders").select("sites(id, slug, name)").eq("user_id", auth.user.id),
    supabase
      .from("memberships")
      .select("role, groups(name, service_slots(day, shift, sites(id, slug, name)))")
      .eq("user_id", auth.user.id)
      .maybeSingle(),
  ]);
  const profile = profileRes.data;
  if (!profile) return null;

  const leaderSites = ((leadersRes.data ?? []) as unknown as { sites: Site }[]).map((r) => r.sites);
  const m = membershipRes.data as unknown as MembershipRow | null;
  const membership = m
    ? {
        role: m.role,
        groupName: m.groups.name,
        service: serviceLabel(m.groups.service_slots.day, m.groups.service_slots.shift),
        day: m.groups.service_slots.day,
        shift: m.groups.service_slots.shift,
        site: m.groups.service_slots.sites,
      }
    : null;

  const roleLabel = profile.is_admin
    ? "Administrador"
    : profile.is_head
      ? "Cabeza de ministerio"
      : leaderSites.length
        ? "Líder de sede"
        : membership
          ? (GROUP_ROLE_LABEL[membership.role] ?? membership.role)
          : "Sin grupo";

  return {
    id: auth.user.id,
    email: profile.email,
    name: profile.full_name ?? profile.email,
    avatarUrl: profile.avatar_url,
    isAdmin: profile.is_admin,
    isHead: profile.is_head,
    leaderSites,
    membership,
    roleLabel,
  };
});

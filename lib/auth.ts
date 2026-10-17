import { cache } from "react";
import { redirect } from "next/navigation";
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
  membership: { role: string; groupId: string; groupName: string; service: string; day: string; shift: string; site: Site } | null;
  /** Puede ver la sección Personas: admin, cabeza, líder de sede o coordinador. */
  canManagePeople: boolean;
  /** Puede administrar horarios y grupos: admin, cabeza o líder de sede. */
  canManageGroups: boolean;
  /** Etiqueta principal del rol, para mostrar en la interfaz. */
  roleLabel: string;
};

type MembershipRow = {
  role: string;
  group_id: string;
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
    supabase.from("profiles").select("full_name, avatar_url, is_admin, is_head").eq("user_id", auth.user.id).maybeSingle(),
    supabase.from("site_leaders").select("sites(id, slug, name)").eq("user_id", auth.user.id),
    supabase
      .from("memberships")
      .select("role, group_id, groups(name, service_slots(day, shift, sites(id, slug, name)))")
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
        groupId: m.group_id,
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
    // El correo viene de la sesión: ya no se guarda en el perfil (es privado).
    email: auth.user.email ?? "",
    name: profile.full_name ?? auth.user.email ?? "Sin nombre",
    avatarUrl: profile.avatar_url,
    isAdmin: profile.is_admin,
    isHead: profile.is_head,
    leaderSites,
    membership,
    canManagePeople: profile.is_admin || profile.is_head || leaderSites.length > 0 || membership?.role === "coordinador",
    canManageGroups: profile.is_admin || profile.is_head || leaderSites.length > 0,
    roleLabel,
  };
});

/**
 * Usuario con cuenta en la aplicación. Si hay sesión pero ya no hay cuenta (por ejemplo, la persona fue eliminada y
 * su sesión sigue vigente hasta que expire), se cierra la sesión y se vuelve al login: sin esto, /login y las páginas
 * se redirigirían una a la otra sin fin.
 */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/expired");
  return user;
}

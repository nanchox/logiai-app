export type GroupRole = "coordinador" | "supervisor" | "voluntario";
export const ROLES: GroupRole[] = ["coordinador", "supervisor", "voluntario"];

export type SiteItem = { id: string; slug: string; name: string };
export type SlotItem = { id: string; siteId: string; day: string; shift: string; arrival: string | null; start: string | null; end: string | null };
export type GroupItem = {
  id: string;
  name: string;
  slotId: string;
  siteId: string;
  siteName: string;
  day: string;
  shift: string;
  memberCount: number;
};
export type MemberItem = {
  userId: string;
  name: string;
  avatarUrl: string | null;
  /** Solo lo ve quien administra a la persona; para los demás es null. */
  email: string | null;
  role: GroupRole;
  groupId: string;
};
export type InviteItem = { id: string; email: string; role: GroupRole; groupId: string; createdAt: string };

/** Quién mira la pantalla y qué puede administrar (refleja las políticas de la base de datos, que son las que mandan). */
export type Viewer = { userId: string; kind: "admin" | "head" | "leader" | "coordinator"; siteIds: string[]; groupId: string | null };

/** Roles que el usuario puede dar dentro de un grupo (igual que can_assign_role en la base de datos). */
export function assignableRoles(v: Viewer, group: Pick<GroupItem, "id" | "siteId">): GroupRole[] {
  if (v.kind === "admin" || v.kind === "head") return [...ROLES];
  if (v.kind === "leader") return v.siteIds.includes(group.siteId) ? [...ROLES] : [];
  return v.groupId === group.id ? ["supervisor", "voluntario"] : [];
}

/** ¿Puede administrar (mover, cambiar rol, eliminar) a esta persona del grupo? */
export function canManageMember(v: Viewer, member: Pick<MemberItem, "userId" | "role">, group: Pick<GroupItem, "id" | "siteId">): boolean {
  return member.userId !== v.userId && assignableRoles(v, group).includes(member.role);
}

/** Grupos a los que puede mover personas. El coordinador no mueve: solo cambia el rol dentro de su grupo. */
export function destinationGroups(v: Viewer, groups: GroupItem[]): GroupItem[] {
  return v.kind === "coordinator" ? [] : groups.filter((g) => assignableRoles(v, g).length > 0);
}

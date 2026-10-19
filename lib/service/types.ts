export type EventStatus = "programado" | "cancelado";
export type EventKind = "rotacion" | "especial";

export type ServiceEvent = {
  id: string;
  slotId: string;
  siteId: string;
  siteName: string;
  siteSlug: string;
  day: string;
  shift: string;
  date: string;
  groupId: string | null;
  groupName: string | null;
  kind: EventKind;
  manual: boolean;
  status: EventStatus;
  cancelReason: string | null;
  note: string | null;
};

export type RotationGroup = { id: string; name: string; slotId: string; order: number };
export type Cancellation = { id: string; date: string; siteId: string | null; siteName: string | null; slotId: string | null; day: string | null; shift: string | null; reason: string | null };

export type PlanPosition = {
  id: string;
  code: string;
  name: string;
  kind: "supervisor" | "voluntario";
  locationName: string;
  usesRadio: boolean;
  sort: number;
};
export type PlanAssignment = { id: string; positionId: string; userId: string };
export type PlanFile = { id: string; name: string; mime: string | null; size: number | null; path: string; url: string | null };
export type PlanData = {
  status: "borrador" | "publicado" | null;
  assignments: PlanAssignment[];
  notes: Record<string, string>;
  files: PlanFile[];
};

export type HistoryItem = { eventId: string; date: string; siteName: string; day: string; shift: string; groupName: string | null; positionName: string; positionCode: string };

/** Quién puede planificar un servicio (igual que can_plan_event en la base de datos). */
export function canPlanEvent(
  user: { isAdmin: boolean; isHead: boolean; leaderSites: { id: string }[]; membership: { role: string; groupId: string } | null },
  ev: Pick<ServiceEvent, "siteId" | "groupId">,
): boolean {
  if (user.isAdmin || user.isHead) return true;
  if (user.leaderSites.some((s) => s.id === ev.siteId)) return true;
  return !!user.membership && user.membership.groupId === ev.groupId && ["coordinador", "supervisor"].includes(user.membership.role);
}

/** Quién puede asignar a esta persona a esta posición: los coordinadores no ocupan posiciones y las de supervisor son solo de supervisores. */
export function canHold(role: string, positionKind: "supervisor" | "voluntario"): boolean {
  if (role === "coordinador") return false;
  return positionKind === "supervisor" ? role === "supervisor" : true;
}

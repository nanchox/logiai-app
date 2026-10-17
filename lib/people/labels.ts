import { DAY_LABEL, SHIFT_LABEL } from "@/lib/labels";
import type { GroupItem, GroupRole } from "./types";

export const ROLE_LABEL: Record<GroupRole, string> = { coordinador: "Coordinador", supervisor: "Supervisor", voluntario: "Voluntario" };
export const ROLE_PLURAL: Record<GroupRole, string> = { coordinador: "Coordinadores", supervisor: "Supervisores", voluntario: "Voluntarios" };

/** «Sábado PM · Grupo 1» */
export const groupLabel = (g: Pick<GroupItem, "day" | "shift" | "name">) =>
  `${[DAY_LABEL[g.day] ?? g.day, SHIFT_LABEL[g.shift] ?? ""].filter(Boolean).join(" ")} · ${g.name}`;

/** Agrupa por sede, conservando el orden recibido. */
export function groupBySite(groups: GroupItem[]): { siteId: string; siteName: string; groups: GroupItem[] }[] {
  const out: { siteId: string; siteName: string; groups: GroupItem[] }[] = [];
  for (const g of groups) {
    const last = out.at(-1);
    if (last && last.siteId === g.siteId) last.groups.push(g);
    else out.push({ siteId: g.siteId, siteName: g.siteName, groups: [g] });
  }
  return out;
}

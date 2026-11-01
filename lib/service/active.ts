// «Servicios activos»: los que tienen fecha de hoy y el siguiente que le toca a la persona. Funciones puras (sin base de datos).
import type { SupportEvent } from "@/lib/support/types";
import type { ServiceEvent } from "./types";

export type ActiveKind = "grupo" | "apoyo" | "sede";
export type ActiveItem = { eventId: string; date: string; siteName: string; day: string; shift: string; groupName: string | null; kind: ActiveKind; isToday: boolean };

/**
 * De una lista de servicios, los activos: todos los programados de hoy y, por cada «clave» (el grupo de la persona, o el horario cuando
 * se acompaña a varios grupos), el siguiente servicio programado de hoy en adelante. Los cancelados y los pasados nunca son activos.
 */
export function pickActive<T extends { id: string; date: string; status: string }>(events: T[], today: string, keyOf: (e: T) => string): T[] {
  const upcoming = events.filter((e) => e.status === "programado" && e.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  const seen = new Set<string>();
  const picked: T[] = [];
  for (const e of upcoming) {
    const first = !seen.has(keyOf(e));
    seen.add(keyOf(e));
    if (first || e.date === today) picked.push(e);
  }
  return picked;
}

/** Los servicios activos de una persona: los de su grupo (o los de su alcance, si acompaña a los grupos) y aquellos en los que apoya. */
export function activeServices(o: { events: ServiceEvent[]; supports: SupportEvent[]; today: string; groupId: string | null; staff: boolean }): ActiveItem[] {
  const own = o.staff
    ? pickActive(o.events, o.today, (e) => e.slotId)
    : o.groupId ? pickActive(o.events.filter((e) => e.groupId === o.groupId), o.today, () => "grupo") : [];
  const items: ActiveItem[] = own.map((e) => ({
    eventId: e.id, date: e.date, siteName: e.siteName, day: e.day, shift: e.shift, groupName: e.groupName, kind: o.staff ? "sede" : "grupo", isToday: e.date === o.today,
  }));
  for (const s of pickActive(o.supports.map((x) => ({ ...x, id: x.eventId })), o.today, () => "apoyo")) {
    if (items.some((i) => i.eventId === s.eventId)) continue;
    items.push({ eventId: s.eventId, date: s.date, siteName: s.siteName, day: s.day, shift: s.shift, groupName: s.groupName, kind: "apoyo", isToday: s.date === o.today });
  }
  return items.sort((a, b) => a.date.localeCompare(b.date) || a.siteName.localeCompare(b.siteName, "es"));
}

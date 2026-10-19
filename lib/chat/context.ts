import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentUser } from "@/lib/auth";
import { serviceLabel } from "@/lib/labels";
import { formatServiceDate, todayCo } from "@/lib/service/dates";
import { loadEvents, loadPlan, loadPlanPositions } from "@/lib/service/load";

/**
 * Datos de la persona que se le pasan al modelo: su rol, su grupo y su próximo servicio con las posiciones publicadas.
 * Nunca incluye el correo ni el nombre.
 */
export async function personContext(supabase: SupabaseClient, user: CurrentUser): Promise<string[]> {
  const lines = [`Rol: ${user.roleLabel}`];
  if (user.isAdmin || user.isHead) lines.push("Sedes: todas");
  else if (user.leaderSites.length) lines.push(`Sedes que lidera: ${user.leaderSites.map((s) => s.name).join(", ")}`);
  const m = user.membership;
  if (!m) return lines;
  lines.push(`Sede: ${m.site.name}`, `Grupo: ${m.groupName} (${m.service})`);
  try {
    const next = (await loadEvents(supabase, { from: todayCo(), groupId: m.groupId, limit: 6 })).find((e) => e.status === "programado");
    if (!next) { lines.push("Próximo servicio: todavía no hay fechas programadas"); return lines; }
    lines.push(`Próximo servicio de su grupo: ${formatServiceDate(next.date)} (${serviceLabel(next.day, next.shift)})`);
    const [plan, positions] = await Promise.all([loadPlan(supabase, next.id), loadPlanPositions(supabase, next.siteId, next.day, next.shift)]);
    if (plan.status !== "publicado") { lines.push("Posiciones de ese servicio: la planeación todavía no está publicada"); return lines; }
    const byId = new Map(positions.map((p) => [p.id, p]));
    const mine = plan.assignments.filter((a) => a.userId === user.id).map((a) => byId.get(a.positionId)).filter((p) => !!p);
    lines.push(mine.length ? `Sus posiciones en ese servicio: ${mine.map((p) => `${p.code} · ${p.name} (${p.locationName})`).join("; ")}` : "Sus posiciones en ese servicio: ninguna asignada");
  } catch {
    // Sin el próximo servicio el asistente sigue funcionando con el manual.
  }
  return lines;
}

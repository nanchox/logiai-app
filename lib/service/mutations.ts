// Operaciones de rotación, calendario y planeación. Se ejecutan con la sesión del usuario: los permisos los decide la base de datos.
import type { SupabaseClient } from "@supabase/supabase-js";
import { explain } from "@/lib/manual/mutations";
import { isDate } from "./dates";
import type { PlanData, PlanPosition, RotationGroup } from "./types";
import { canHold } from "./types";

type PgError = { code?: string; message: string } | null;
const must = <T>(r: { data: T; error: PgError }): T => {
  if (r.error) throw explain(r.error);
  return r.data;
};

// ───────────── Rotación ─────────────
export type GenerateResult = { created: number; updated: number; protected: number; kept: number };

export async function generateEvents(sb: SupabaseClient, slotId: string, from: string, until: string, firstGroupId?: string | null): Promise<GenerateResult> {
  if (!isDate(from) || !isDate(until)) throw new Error("Elige las fechas de inicio y fin.");
  return must(await sb.rpc("generate_service_events", { p_slot: slotId, p_from: from, p_until: until, p_first_group: firstGroupId || null })) as GenerateResult;
}

export const describeGenerate = (r: GenerateResult) => {
  const parts = [
    r.created && `${r.created} ${r.created === 1 ? "servicio creado" : "servicios creados"}`,
    r.updated && `${r.updated} ${r.updated === 1 ? "actualizado" : "actualizados"}`,
    r.protected && `${r.protected} con planeación o archivos conservan su grupo`,
    r.kept && `${r.kept} ajustados a mano o especiales sin tocar`,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Todo estaba al día: no hubo cambios.";
};

/** Sube o baja un grupo en el orden de rotación de su horario (intercambia el puesto con el vecino). */
export async function moveGroup(sb: SupabaseClient, ordered: RotationGroup[], index: number, delta: -1 | 1) {
  const a = ordered[index];
  const b = ordered[index + delta];
  if (!a || !b) return;
  // Se reescribe el orden completo como 1..n para que nunca queden empates.
  const next = ordered.map((g) => g.id);
  [next[index], next[index + delta]] = [next[index + delta], next[index]];
  for (const [i, id] of next.entries()) must(await sb.from("groups").update({ rotation_order: i + 1 }).eq("id", id));
}

// ───────────── Cancelaciones y servicios ─────────────
export async function addCancellation(sb: SupabaseClient, c: { date: string; siteId: string | null; slotId: string | null; reason: string }) {
  if (!isDate(c.date)) throw new Error("Elige la fecha que se cancela.");
  must(await sb.from("service_cancellations").insert({ service_date: c.date, site_id: c.siteId, slot_id: c.slotId, reason: c.reason.trim() || null }));
}
export async function deleteCancellation(sb: SupabaseClient, id: string) {
  must(await sb.from("service_cancellations").delete().eq("id", id));
}

export async function setEventGroup(sb: SupabaseClient, eventId: string, groupId: string) {
  must(await sb.rpc("set_event_group", { p_event: eventId, p_group: groupId }));
}
export async function resetEventGroup(sb: SupabaseClient, eventId: string) {
  must(await sb.rpc("reset_event_group", { p_event: eventId }));
}
export async function createSpecialEvent(sb: SupabaseClient, slotId: string, date: string, groupId: string, note: string) {
  if (!isDate(date)) throw new Error("Elige la fecha del servicio.");
  if (!groupId) throw new Error("Elige el grupo que sirve.");
  return must(await sb.rpc("create_special_event", { p_slot: slotId, p_date: date, p_group: groupId, p_note: note })) as string;
}
export async function deleteEvent(sb: SupabaseClient, eventId: string) {
  const rows = must(await sb.from("service_events").delete().eq("id", eventId).select("id")) as unknown[];
  if (!rows.length) throw new Error("Solo se pueden eliminar los servicios especiales.");
}
export async function saveEventNote(sb: SupabaseClient, eventId: string, note: string) {
  const rows = must(await sb.from("service_events").update({ note: note.trim() || null }).eq("id", eventId).select("id")) as unknown[];
  if (!rows.length) throw new Error("No tienes permiso para cambiar este servicio.");
}

// ───────────── Planeación ─────────────
export async function setPlanStatus(sb: SupabaseClient, eventId: string, status: "borrador" | "publicado") {
  must(await sb.from("service_plans").upsert({ event_id: eventId, status }, { onConflict: "event_id" }));
}
/** Crea el borrador si todavía no existe (la primera vez que se asigna algo). */
async function ensurePlan(sb: SupabaseClient, eventId: string) {
  must(await sb.from("service_plans").upsert({ event_id: eventId }, { onConflict: "event_id", ignoreDuplicates: true }));
}

export async function assignPerson(sb: SupabaseClient, eventId: string, positionId: string, userId: string) {
  await ensurePlan(sb, eventId);
  must(await sb.from("service_assignments").insert({ event_id: eventId, position_id: positionId, user_id: userId }));
}
export async function unassign(sb: SupabaseClient, assignmentId: string) {
  must(await sb.from("service_assignments").delete().eq("id", assignmentId));
}
export async function savePositionNote(sb: SupabaseClient, eventId: string, positionId: string, note: string) {
  const text = note.trim();
  if (!text) {
    must(await sb.from("service_position_notes").delete().eq("event_id", eventId).eq("position_id", positionId));
    return;
  }
  await ensurePlan(sb, eventId);
  must(await sb.from("service_position_notes").upsert({ event_id: eventId, position_id: positionId, note: text }, { onConflict: "event_id,position_id" }));
}

/**
 * Copia como punto de partida la planeación del servicio anterior del mismo grupo.
 * Solo pasa lo que sigue siendo válido hoy: la persona sigue en el grupo y puede ocupar la posición, y la posición está activa y aplica.
 */
export async function copyPreviousPlan(
  sb: SupabaseClient, eventId: string, groupId: string, date: string, positions: PlanPosition[], members: { userId: string; role: string }[], current: PlanData,
): Promise<{ copied: number; skipped: number }> {
  const prev = must(await sb.from("service_events").select("id").eq("group_id", groupId).lt("service_date", date).order("service_date", { ascending: false }).limit(20)) as { id: string }[];
  let source: string | null = null;
  for (const p of prev) {
    const { count } = await sb.from("service_assignments").select("id", { count: "exact", head: true }).eq("event_id", p.id);
    if (count) { source = p.id; break; }
  }
  if (!source) throw new Error("Este grupo todavía no tiene un servicio anterior con planeación.");

  const [as, ns] = await Promise.all([
    sb.from("service_assignments").select("position_id, user_id").eq("event_id", source),
    sb.from("service_position_notes").select("position_id, note").eq("event_id", source),
  ]);
  const posById = new Map(positions.map((p) => [p.id, p]));
  const roleOf = new Map(members.map((m) => [m.userId, m.role]));
  const have = new Set(current.assignments.map((a) => `${a.positionId}:${a.userId}`));
  let copied = 0;
  let skipped = 0;
  const rows: { event_id: string; position_id: string; user_id: string }[] = [];
  for (const a of as.data ?? []) {
    const pos = posById.get(a.position_id);
    const role = roleOf.get(a.user_id);
    if (!pos || !role || !canHold(role, pos.kind)) { skipped++; continue; }
    if (have.has(`${a.position_id}:${a.user_id}`)) continue;
    rows.push({ event_id: eventId, position_id: a.position_id, user_id: a.user_id });
    copied++;
  }
  await ensurePlan(sb, eventId);
  if (rows.length) must(await sb.from("service_assignments").insert(rows));
  const notes = (ns.data ?? []).filter((n) => posById.has(n.position_id) && !current.notes[n.position_id]).map((n) => ({ event_id: eventId, position_id: n.position_id, note: n.note }));
  if (notes.length) must(await sb.from("service_position_notes").upsert(notes, { onConflict: "event_id,position_id" }));
  return { copied, skipped };
}

// ───────────── Archivos de programación (PDF, Excel o imagen) ─────────────
export const FILE_ACCEPT = ".pdf,.xlsx,.xls,.csv,.png,.jpg,.jpeg,.webp,application/pdf,image/*";
const MIME_BY_EXT: Record<string, string> = {
  pdf: "application/pdf", csv: "text/csv", xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp",
};
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

export function fileKind(file: { name: string; type?: string | null }): string | null {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return MIME_BY_EXT[ext] ?? null;
}

export async function uploadScheduleFile(sb: SupabaseClient, siteSlug: string, eventId: string, file: File) {
  const mime = fileKind(file);
  if (!mime) throw new Error("Sube un PDF, un Excel (xlsx, xls, csv) o una imagen (png, jpg, webp).");
  if (file.size > MAX_FILE_BYTES) throw new Error("El archivo pesa más de 10 MB.");
  if (file.size === 0) throw new Error("El archivo está vacío.");
  const ext = file.name.split(".").pop()!.toLowerCase();
  const path = `${siteSlug}/${eventId}/${crypto.randomUUID()}.${ext}`;
  const up = await sb.storage.from("schedules").upload(path, file, { contentType: mime });
  if (up.error) throw explain(up.error, "No se pudo subir el archivo.");
  const ins = await sb.from("schedule_files").insert({ event_id: eventId, storage_path: path, file_name: file.name.slice(0, 200), mime_type: mime, size_bytes: file.size });
  if (ins.error) {
    await sb.storage.from("schedules").remove([path]);
    throw explain(ins.error);
  }
}
export async function deleteScheduleFile(sb: SupabaseClient, f: { id: string; path: string }) {
  must(await sb.from("schedule_files").delete().eq("id", f.id));
  await sb.storage.from("schedules").remove([f.path]);
}

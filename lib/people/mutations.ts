// Operaciones de personas y grupos. Se ejecutan con la sesión del usuario: los permisos los decide la base de datos.
import type { SupabaseClient } from "@supabase/supabase-js";
import { explain } from "@/lib/manual/mutations";
import { MAX_EMAILS, parseEmails } from "./emails";
import type { GroupRole } from "./types";

type PgError = { code?: string; message: string } | null;
const must = <T>(r: { data: T; error: PgError }): T => {
  if (r.error) throw explain(r.error);
  return r.data;
};

// ───────────── Correos ─────────────
export type InviteResult = { added: string[]; existing: string[]; invalid: string[] };

type InviteTarget =
  | { kind: "group"; groupId: string; role: GroupRole }
  | { kind: "leader"; siteIds: string[] }
  | { kind: "head" }
  | { kind: "admin" };

/** Invita correos. Los que ya tienen invitación o cuenta no se tocan y se informan aparte. */
export async function inviteEmails(sb: SupabaseClient, text: string, target: InviteTarget): Promise<InviteResult> {
  const { valid, invalid } = parseEmails(text);
  if (!valid.length) throw new Error(invalid.length ? "Ninguno de los correos es válido." : "Escribe al menos un correo.");
  if (valid.length > MAX_EMAILS) throw new Error(`Máximo ${MAX_EMAILS} correos por vez.`);
  if (target.kind === "leader" && !target.siteIds.length) throw new Error("Elige al menos una sede para el líder.");

  const base =
    target.kind === "group" ? { group_id: target.groupId, group_role: target.role }
    : target.kind === "leader" ? { leader_site_ids: target.siteIds }
    : target.kind === "head" ? { is_head: true }
    : { is_admin: true };
  const rows = valid.map((email) => ({ email, ...base }));

  const inserted = must(
    await sb.from("invitations").upsert(rows, { onConflict: "email", ignoreDuplicates: true }).select("email"),
  ) as { email: string }[];
  const added = new Set(inserted.map((r) => r.email));
  return { added: valid.filter((e) => added.has(e)), existing: valid.filter((e) => !added.has(e)), invalid };
}

export async function deleteInvitation(sb: SupabaseClient, id: string) {
  must(await sb.from("invitations").delete().eq("id", id));
}

// ───────────── Integrantes ─────────────
/** Cambia el rol y/o mueve a otro grupo, horario o sede (si el usuario tiene permiso en el destino). */
export async function updateMember(sb: SupabaseClient, userId: string, change: { groupId: string; role: GroupRole }) {
  const rows = must(await sb.from("memberships").update({ group_id: change.groupId, role: change.role }).eq("user_id", userId).select("user_id")) as unknown[];
  if (!rows.length) throw new Error("No tienes permiso para cambiar a esta persona.");
}

/** Elimina a la persona de la aplicación: su cuenta y su invitación (para volver, hay que invitarla de nuevo). */
export async function deletePerson(sb: SupabaseClient, userId: string) {
  must(await sb.rpc("delete_person", { p_user: userId }));
}

// ───────────── Horarios y grupos ─────────────
export type SlotInput = { siteId: string; day: string; shift: string; arrival: string; start: string; end: string };
const time = (v: string) => v || null;

export async function createSlot(sb: SupabaseClient, s: SlotInput) {
  return (must(await sb.from("service_slots").insert({ site_id: s.siteId, day: s.day, shift: s.shift, arrival_time: time(s.arrival), start_time: time(s.start), end_time: time(s.end) }).select("id").single()) as { id: string }).id;
}
export async function updateSlot(sb: SupabaseClient, id: string, s: Pick<SlotInput, "arrival" | "start" | "end">) {
  must(await sb.from("service_slots").update({ arrival_time: time(s.arrival), start_time: time(s.start), end_time: time(s.end) }).eq("id", id));
}
export async function deleteSlot(sb: SupabaseClient, id: string) {
  must(await sb.from("service_slots").delete().eq("id", id));
}
export async function createGroup(sb: SupabaseClient, slotId: string, name: string) {
  if (!name.trim()) throw new Error("El nombre del grupo es obligatorio.");
  must(await sb.from("groups").insert({ service_slot_id: slotId, name: name.trim() }));
}
export async function renameGroup(sb: SupabaseClient, id: string, name: string) {
  if (!name.trim()) throw new Error("El nombre del grupo es obligatorio.");
  must(await sb.from("groups").update({ name: name.trim() }).eq("id", id));
}
export async function deleteGroup(sb: SupabaseClient, id: string) {
  must(await sb.from("groups").delete().eq("id", id));
}

// ───────────── Líderes de sede ─────────────
export async function addLeaderSite(sb: SupabaseClient, userId: string, siteId: string) {
  must(await sb.from("site_leaders").insert({ user_id: userId, site_id: siteId }));
}
export async function removeLeaderSite(sb: SupabaseClient, userId: string, siteId: string) {
  must(await sb.from("site_leaders").delete().eq("user_id", userId).eq("site_id", siteId));
}

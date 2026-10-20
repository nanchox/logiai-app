// Ausencias, apoyos y solicitudes. Todo pasa por funciones de la base de datos que validan las reglas; aquí solo se llaman.
import type { SupabaseClient } from "@supabase/supabase-js";
import { explain } from "@/lib/manual/mutations";

type PgError = { code?: string; message: string } | null;
const run = async (p: PromiseLike<{ error: PgError }>) => {
  const { error } = await p;
  if (error) throw explain(error);
};

export const markAbsent = (sb: SupabaseClient, eventId: string, userId: string) => run(sb.rpc("mark_absent", { p_event: eventId, p_user: userId }));
export const unmarkAbsent = (sb: SupabaseClient, eventId: string, userId: string) => run(sb.rpc("unmark_absent", { p_event: eventId, p_user: userId }));
export const addSupporter = (sb: SupabaseClient, eventId: string, userId: string) => run(sb.rpc("add_supporter", { p_event: eventId, p_user: userId }));
export const removeSupporter = (sb: SupabaseClient, eventId: string, userId: string) => run(sb.rpc("remove_supporter", { p_event: eventId, p_user: userId }));

export async function createSupportRequest(_sb: SupabaseClient, eventId: string, needed: number, note: string, positionIds: string[]) {
  if (!Number.isInteger(needed) || needed < 1 || needed > 50) throw new Error("Indica cuántas personas necesitas (de 1 a 50).");
  // Pasa por el servidor para que, al publicarla, avise al teléfono de quienes pueden atenderla (los permisos los valida la base de datos).
  const res = await fetch("/api/support/request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventId, needed, note: note.trim() || null, positionIds }) });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(data.error ?? "No se pudo publicar la solicitud.");
}
export const cancelSupportRequest = (sb: SupabaseClient, requestId: string) => run(sb.rpc("cancel_support_request", { p_request: requestId }));
export const applyToRequest = (sb: SupabaseClient, requestId: string) => run(sb.rpc("apply_to_request", { p_request: requestId }));
export const withdrawApplication = (sb: SupabaseClient, applicationId: string) => run(sb.rpc("withdraw_application", { p_application: applicationId }));
export const decideApplication = (sb: SupabaseClient, applicationId: string, approve: boolean) => run(sb.rpc("decide_application", { p_application: applicationId, p_approve: approve }));

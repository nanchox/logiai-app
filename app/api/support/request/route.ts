import { after, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { explain } from "@/lib/manual/mutations";
import { notifySupportRequest } from "@/lib/push/notify";
import { pushConfigured } from "@/lib/push/config";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (status: number, error: string) => NextResponse.json({ error }, { status });

/**
 * Publica una solicitud de apoyo con la sesión de quien la pide (la base de datos valida los permisos y las reglas) y, si los avisos
 * están configurados, avisa al teléfono de quienes pueden atenderla.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return fail(401, "Inicia sesión para continuar.");
  if (!user.privacyAccepted) return fail(403, "Acepta la política de datos y los términos para continuar.");

  const b = (await req.json().catch(() => null)) as { eventId?: unknown; needed?: unknown; note?: unknown; positionIds?: unknown } | null;
  const positionIds = Array.isArray(b?.positionIds) ? b.positionIds : [];
  if (!b || typeof b.eventId !== "string" || !UUID.test(b.eventId) || typeof b.needed !== "number" || !Number.isInteger(b.needed)
      || (b.note != null && typeof b.note !== "string") || !positionIds.every((p) => typeof p === "string" && UUID.test(p)) || positionIds.length > 100) {
    return fail(400, "La solicitud no es válida.");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_support_request", { p_event: b.eventId, p_needed: b.needed, p_note: (b.note as string | null | undefined)?.trim() || null, p_positions: positionIds });
  if (error) return fail(400, explain(error).message);

  const id = data as string;
  const admin = pushConfigured() ? createAdminClient() : null;
  if (admin) after(async () => { try { await notifySupportRequest(admin, id); } catch (e) { console.error("No se pudieron enviar los avisos de la solicitud", e); } });
  return NextResponse.json({ id });
}

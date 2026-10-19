// Operaciones de la persona sobre sus propios datos (acceso, rectificación, aceptación y baja). Corren con su sesión: RLS decide.
import type { SupabaseClient } from "@supabase/supabase-js";
import { explain } from "@/lib/manual/mutations";
import { loadHistory } from "@/lib/service/load";

export async function acceptPolicy(sb: SupabaseClient, userId: string, version: string) {
  const { error } = await sb.from("consents").insert({ user_id: userId, policy_version: version });
  if (error && error.code !== "23505") throw explain(error, "No se pudo registrar tu aceptación. Intenta de nuevo.");   // 23505: ya la había aceptado
}

export async function renameMe(sb: SupabaseClient, userId: string, name: string) {
  const full = name.trim().replace(/\s+/g, " ");
  if (!full) throw new Error("Escribe tu nombre.");
  if (full.length > 100) throw new Error("El nombre es demasiado largo.");
  const { data, error } = await sb.from("profiles").update({ full_name: full }).eq("user_id", userId).select("user_id");
  if (error) throw explain(error);
  if (!data?.length) throw new Error("No se pudo actualizar tu nombre.");
}

/** Elimina la cuenta de quien llama y cierra su sesión. */
export async function deleteMyAccount(sb: SupabaseClient) {
  const { error } = await sb.rpc("delete_my_account");
  if (error) throw explain(error, "No se pudo eliminar tu cuenta.");
  await sb.auth.signOut().catch(() => undefined);   // la sesión ya no tiene cuenta: solo se limpian las cookies
}

/** Reúne todo lo que la aplicación guarda de la persona (derecho de acceso) en un objeto listo para descargar. */
export async function collectMyData(sb: SupabaseClient, userId: string, email: string) {
  const [profile, memberships, consents, history] = await Promise.all([
    sb.from("profiles").select("full_name, is_admin, is_head, created_at").eq("user_id", userId).maybeSingle(),
    sb.from("memberships").select("role, groups(name, service_slots(day, shift, sites(name)))").eq("user_id", userId),
    sb.from("consents").select("policy_version, accepted_at").eq("user_id", userId).order("accepted_at"),
    loadHistory(sb, userId, 1000),
  ]);
  const leads = await sb.from("site_leaders").select("sites(name)").eq("user_id", userId);
  return {
    generadoEn: new Date().toISOString(),
    descripcion: "Datos personales que LogiAI guarda sobre ti. No incluye el contenido de las conversaciones con el asistente porque no se guarda.",
    cuenta: { correo: email, nombre: profile.data?.full_name ?? null, administrador: !!profile.data?.is_admin, cabezaDeMinisterio: !!profile.data?.is_head, creadaEn: profile.data?.created_at ?? null },
    sedesQueLidera: (leads.data ?? []).map((l) => (l as unknown as { sites: { name: string } }).sites.name),
    grupos: memberships.data ?? [],
    aceptaciones: consents.data ?? [],
    historialDePosiciones: history,
  };
}

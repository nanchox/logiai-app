import { createClient } from "@supabase/supabase-js";

/**
 * Cliente con permisos de servidor (service_role): se salta RLS. SOLO para tareas del servidor que lo necesitan (avisos al teléfono) y
 * siempre después de comprobar quién llama. Nunca se importa desde un componente del navegador y la clave nunca lleva NEXT_PUBLIC_.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

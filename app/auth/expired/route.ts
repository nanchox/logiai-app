import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Sesión sin cuenta (la persona fue eliminada o nunca se creó su perfil): se cierra la sesión y se vuelve al login.
 * Si en realidad la cuenta existe, no se toca nada y se vuelve al inicio.
 */
export async function GET(request: NextRequest) {
  const { origin } = new URL(request.url);
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (data.user) {
    const { data: profile } = await supabase.from("profiles").select("user_id").eq("user_id", data.user.id).maybeSingle();
    if (profile) return NextResponse.redirect(`${origin}/`);
  }
  await supabase.auth.signOut();
  return NextResponse.redirect(`${origin}/login?error=sin-cuenta`);
}

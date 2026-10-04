import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

const loginError = (origin: string, code: string) => NextResponse.redirect(`${origin}/login?error=${code}`);

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);

  // Supabase devuelve el error en la URL cuando el hook/trigger rechaza un correo sin invitación.
  if (searchParams.get("error")) return loginError(origin, "sin-invitacion");

  const code = searchParams.get("code");
  if (!code) return loginError(origin, "oauth");

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return loginError(origin, "oauth");

  // Segunda barrera: toda cuenta válida tiene perfil (lo crea la invitación).
  const { data: userData } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("user_id")
    .eq("user_id", userData.user?.id ?? "")
    .maybeSingle();
  if (!profile) {
    await supabase.auth.signOut();
    return loginError(origin, "sin-invitacion");
  }

  return NextResponse.redirect(`${origin}/`);
}

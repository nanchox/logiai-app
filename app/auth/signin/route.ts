import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

const loginError = (origin: string) => NextResponse.redirect(`${origin}/login?error=oauth`);

export async function GET(request: NextRequest) {
  const { origin } = new URL(request.url);
  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${origin}/auth/callback` },
  });

  if (error || !data.url) return loginError(origin);
  return NextResponse.redirect(data.url);
}

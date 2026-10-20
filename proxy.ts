import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseConfig } from "@/lib/supabase/env";

// Públicas: el ingreso, los textos legales y lo que el navegador pide sin sesión para instalar la aplicación (manifiesto, iconos,
// service worker y pantalla de sin conexión). /api/cron las protege su propio secreto.
const PUBLIC_PATHS = ["/login", "/auth", "/politica", "/terminos", "/manifest.webmanifest", "/sw.js", "/offline", "/icons", "/api/cron"];

// Refresca la sesión de Supabase en cada petición y envía a /login a quien no la tenga.
// Es solo una comprobación optimista: los permisos reales los aplica RLS en la base de datos.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const { url, key } = getSupabaseConfig();
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!data?.claims && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { ThemeToggle } from "@/components/ThemeToggle";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Ingresar" };

const ERRORS: Record<string, string> = {
  "sin-invitacion": "Este correo no está autorizado. Pide a tu coordinador o líder de sede que te agregue.",
  oauth: "No se pudo completar el ingreso con Google. Intenta de nuevo.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (data?.claims) redirect("/");

  const { error } = await searchParams;
  const message = typeof error === "string" ? ERRORS[error] : undefined;

  return (
    <main className="grid min-h-dvh place-items-center bg-surface px-4">
      <div className="absolute right-4 top-4 rounded-full bg-header"><ThemeToggle /></div>
      <section className="w-full max-w-sm rounded-2xl border border-line bg-bg p-8 shadow-lg">
        <p className="text-sm font-bold tracking-[0.2em] text-link">LOGIAI</p>
        <h1 className="mt-2 text-2xl font-extrabold">El Lugar de Su Presencia</h1>
        <p className="mb-6 mt-1 text-muted">Manual de logística y servicio del equipo.</p>
        {message && (
          <p role="alert" className="mb-4 rounded-lg border border-danger/60 bg-danger/10 p-3 text-sm">{message}</p>
        )}
        <GoogleSignInButton />
        <p className="mt-6 text-xs text-muted">Solo pueden ingresar quienes hayan sido agregados por su líder de sede o coordinador.</p>
      </section>
    </main>
  );
}

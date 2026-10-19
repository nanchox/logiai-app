import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { ThemeToggle } from "@/components/ThemeToggle";
import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Ingresar" };

const ERRORS: Record<string, string> = {
  "sin-cuenta": "Tu cuenta ya no tiene acceso a la aplicación. Si crees que es un error, pide a tu coordinador o líder de sede que te agregue de nuevo.",
  "sin-invitacion": "Este correo no está autorizado. Pide a tu coordinador o líder de sede que te agregue.",
  oauth: "No se pudo completar el ingreso con Google. Intenta de nuevo.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  // Solo se salta el login si la persona tiene cuenta en la aplicación (una sesión sin cuenta no cuenta).
  if (await getCurrentUser()) redirect("/");

  const { error } = await searchParams;
  const { baja } = await searchParams;
  const message = typeof error === "string" ? ERRORS[error] : undefined;

  return (
    <main className="grid min-h-dvh place-items-center bg-surface px-4">
      <div className="absolute right-4 top-4 rounded-full bg-header"><ThemeToggle /></div>
      <section className="w-full max-w-sm rounded-2xl border border-line bg-bg p-8 shadow-lg">
        <p className="text-sm font-bold tracking-[0.2em] text-link">LOGIAI</p>
        <h1 className="mt-2 text-2xl font-extrabold">Asistente de Logística de la Iglesia</h1>
        <p className="mb-6 mt-1 text-muted">Manual de logística y servicio del equipo.</p>
        {baja !== undefined && (
          <p role="status" className="mb-4 rounded-lg border border-primary/50 bg-primary/10 p-3 text-sm">Tu cuenta y tus datos fueron eliminados. Si quieres volver, pide a tu coordinador o líder de sede que te invite de nuevo.</p>
        )}
        {message && (
          <p role="alert" className="mb-4 rounded-lg border border-danger/60 bg-danger/10 p-3 text-sm">{message}</p>
        )}
        <GoogleSignInButton />
        <p className="mt-6 text-xs text-muted">Solo pueden ingresar quienes hayan sido agregados por su líder de sede o coordinador.</p>
        <p className="mt-3 text-xs text-muted">
          Al ingresar podrás revisar y aceptar la <Link href="/politica">Política de tratamiento de datos</Link> y los <Link href="/terminos">Términos y condiciones</Link>.
        </p>
      </section>
    </main>
  );
}

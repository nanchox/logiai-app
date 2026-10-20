import Link from "next/link";
import { redirect } from "next/navigation";
import { ThemeToggle } from "@/components/ThemeToggle";
import { requireUser } from "@/lib/auth";
import { loadOpenRequests } from "@/lib/support/load";
import { createClient } from "@/lib/supabase/server";

const navLink = "shrink-0 whitespace-nowrap rounded-lg px-3 py-2 !text-on-header no-underline hover:bg-white/10";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  if (!user.privacyAccepted) redirect("/aceptar");
  // Solicitudes de apoyo que la persona puede atender y aún no ha respondido (contador del menú).
  const pending = (await loadOpenRequests(await createClient())).filter((r) => r.myStatus === null).length;

  return (
    <>
      <header className="sticky top-0 z-30 bg-header text-on-header shadow">
        {/* En móvil: arriba el logo y los botones; debajo los enlaces, con desplazamiento si no caben. */}
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5">
          <Link href="/" className="order-1 text-sm font-extrabold tracking-[0.2em] !text-on-header no-underline">LOGIAI</Link>
          <nav aria-label="Principal" className="order-3 -mx-1 flex w-full items-center gap-1 overflow-x-auto text-sm font-semibold sm:order-2 sm:mx-0 sm:w-auto sm:flex-1">
            <Link href="/" className={navLink}>Inicio</Link>
            <Link href="/novedades" className={navLink}>Novedades</Link>
            <Link href="/manual" className={navLink}>Manual</Link>
            <Link href="/servicio" className={navLink}>Mi servicio{pending > 0 && <span aria-label={`${pending} solicitudes de apoyo`} className="ml-1.5 rounded-full bg-accent px-1.5 py-0.5 text-xs font-extrabold text-on-accent">{pending}</span>}</Link>
            <Link href="/asistente" className={navLink}>Asistente</Link>
            {user.membership && <Link href="/grupo" className={navLink}>Mi grupo</Link>}
            {user.canManagePeople && <Link href="/personas" className={navLink}>Personas</Link>}
            <Link href="/perfil" className={`${navLink} sm:hidden`}>Perfil</Link>
          </nav>
          <div className="order-2 ml-auto flex items-center gap-3 sm:order-3 sm:ml-0">
            <Link href="/perfil" aria-label="Mi perfil" className="hidden text-right leading-tight !text-on-header no-underline hover:opacity-90 sm:block">
              <p className="text-sm font-semibold">{user.name}</p>
              <p className="text-xs opacity-80">{user.roleLabel}</p>
            </Link>
            <ThemeToggle />
            <form action="/auth/signout" method="post">
              <button type="submit" className="rounded-lg border border-white/30 px-3 py-2 text-sm font-semibold hover:bg-white/10">Salir</button>
            </form>
          </div>
        </div>
      </header>
      <div className="mx-auto w-full max-w-6xl px-4 py-6">{children}</div>
    </>
  );
}

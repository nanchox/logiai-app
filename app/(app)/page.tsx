import Link from "next/link";
import { requireUser } from "@/lib/auth";

export default async function HomePage() {
  const user = await requireUser();

  const scope = user.isAdmin || user.isHead
    ? "Todas las sedes"
    : user.leaderSites.length
      ? user.leaderSites.map((s) => s.name).join(", ")
      : user.membership?.site.name;

  return (
    <main className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">Hola, {user.name.split(" ")[0]}</h1>
        <p className="mt-1 text-muted">
          <span className="mr-2 inline-block rounded-full bg-bronze px-2.5 py-0.5 text-xs font-bold text-on-bronze">{user.roleLabel}</span>
          {scope}
        </p>
      </div>

      {user.membership ? (
        <section className="rounded-2xl border border-line bg-surface p-5">
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted">Mi grupo</h2>
          <p className="mt-1 text-xl font-bold">{user.membership.groupName}</p>
          <p className="text-muted">{user.membership.service} · {user.membership.site.name}</p>
        </section>
      ) : (
        <section className="rounded-2xl border border-line bg-surface p-5 text-muted">
          No perteneces a un grupo de servicio{user.isAdmin || user.isHead || user.leaderSites.length ? " (tu rol acompaña a los grupos)." : ". Pide a tu coordinador que te agregue."}
        </section>
      )}

      {(user.membership || user.canManagePeople) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {user.membership && (
            <Link href="/grupo" className="block rounded-2xl border border-line bg-surface p-5 no-underline hover:border-primary">
              <span className="text-lg font-bold text-fg">Mi grupo</span>
              <span className="mt-1 block text-sm text-muted">Quiénes servimos juntos en {user.membership.groupName}.</span>
            </Link>
          )}
          {user.canManagePeople && (
            <Link href="/personas" className="block rounded-2xl border border-line bg-surface p-5 no-underline hover:border-primary">
              <span className="text-lg font-bold text-fg">Personas</span>
              <span className="mt-1 block text-sm text-muted">Agrega correos para que entren con Google y administra a tu equipo.</span>
            </Link>
          )}
        </div>
      )}

      <Link href="/manual" className="block rounded-2xl bg-primary p-5 !text-on-primary no-underline shadow hover:brightness-110">
        <span className="text-lg font-extrabold">Ver el manual de logística</span>
        <span className="mt-1 block text-sm opacity-90">Mapas, posiciones e indicaciones de tu sede.</span>
      </Link>
    </main>
  );
}

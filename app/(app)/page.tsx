import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

export default async function HomePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

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

      <Link href="/manual" className="block rounded-2xl bg-primary p-5 !text-on-primary no-underline shadow hover:brightness-110">
        <span className="text-lg font-extrabold">Ver el manual de logística</span>
        <span className="mt-1 block text-sm opacity-90">Mapas, posiciones e indicaciones de tu sede.</span>
      </Link>
    </main>
  );
}

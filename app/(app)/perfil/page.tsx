import type { Metadata } from "next";
import Link from "next/link";
import { InstallApp, PushSettings } from "@/components/profile/AppSettings";
import { DeleteAccount } from "@/components/profile/DeleteAccount";
import { DownloadData, RenameForm } from "@/components/profile/ProfileActions";
import { requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/announcements/dates";
import { legalContact, POLICY_VERSION } from "@/lib/legal/config";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Mi perfil" };

const card = "space-y-3 rounded-2xl border border-line bg-surface p-5";

export default async function ProfilePage() {
  const user = await requireUser();
  const supabase = await createClient();
  const { data: consent } = await supabase.from("consents").select("accepted_at").eq("user_id", user.id).eq("policy_version", POLICY_VERSION).maybeSingle();
  const scope = user.isAdmin || user.isHead ? "Todas las sedes" : user.leaderSites.length ? user.leaderSites.map((s) => s.name).join(", ") : user.membership ? `${user.membership.site.name} · ${user.membership.groupName} (${user.membership.service})` : "Sin grupo";
  const legal = legalContact();

  return (
    <main className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">Mi perfil</h1>
        <p className="mt-1 text-muted">Tu cuenta, tus datos y tu privacidad.</p>
      </div>

      {user.isAdmin && legal.incomplete && (
        <p role="status" className="rounded-2xl border border-danger/60 bg-danger/10 p-4 text-sm">
          <strong>Falta configurar los datos legales.</strong> La política de datos debe indicar quién administra la aplicación y un correo de contacto (variables <code>LEGAL_NAME</code>,{" "}
          <code>LEGAL_CITY</code> y <code>LEGAL_EMAIL</code> en Vercel).
        </p>
      )}

      <section aria-label="Mi cuenta" className={card}>
        <h2 className="text-lg font-extrabold">Mi cuenta</h2>
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[8rem_1fr]">
          <dt className="font-bold text-muted">Correo</dt><dd className="break-all">{user.email}</dd>
          <dt className="font-bold text-muted">Rol</dt><dd>{user.roleLabel}</dd>
          <dt className="font-bold text-muted">Sede y grupo</dt><dd>{scope}</dd>
        </dl>
        <RenameForm userId={user.id} name={user.name} />
      </section>

      <section aria-label="Aplicación y avisos" className={card}>
        <h2 className="text-lg font-extrabold">Aplicación y avisos</h2>
        <InstallApp />
        <div className="border-t border-line pt-3">
          <h3 className="mb-2 text-sm font-bold uppercase tracking-wider text-muted">Avisos al teléfono</h3>
          <PushSettings vapidKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() ?? ""} userId={user.id} isPlanner={!!user.membership && ["coordinador", "supervisor"].includes(user.membership.role)} />
        </div>
      </section>

      <section aria-label="Privacidad" className={card}>
        <h2 className="text-lg font-extrabold">Privacidad y términos</h2>
        <p className="text-sm">
          {consent ? <>Aceptaste la política de datos y los términos el <strong>{formatDateTime(consent.accepted_at)}</strong> (versión {POLICY_VERSION}).</> : "Aún no hay constancia de tu aceptación."}
        </p>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li><Link href="/politica">Política de tratamiento de datos personales</Link></li>
          <li><Link href="/terminos">Términos y condiciones</Link></li>
        </ul>
        <p className="text-sm text-muted">Tu correo es privado: solo lo ven tú y quien te administra. No guardamos tus conversaciones con el asistente.</p>
      </section>

      <section aria-label="Mis datos" className={card}>
        <h2 className="text-lg font-extrabold">Mis datos</h2>
        <p className="text-sm text-muted">Descarga una copia de lo que LogiAI guarda sobre ti, en un archivo que puedes abrir y conservar.</p>
        <DownloadData userId={user.id} email={user.email} />
      </section>

      <section aria-label="Eliminar mi cuenta" className={`${card} border-danger/50`}>
        <h2 className="text-lg font-extrabold">Eliminar mi cuenta</h2>
        <p className="text-sm text-muted">Puedes darte de baja cuando quieras: se borran tu perfil, tu correo, tu grupo y tus asignaciones. Es inmediato y no se puede deshacer.</p>
        <DeleteAccount blocked={user.isAdmin || user.isHead} />
      </section>
    </main>
  );
}

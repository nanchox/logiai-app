import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AcceptForm } from "@/components/legal/AcceptForm";
import { getCurrentUser } from "@/lib/auth";
import { POLICY_VERSION } from "@/lib/legal/config";

export const metadata: Metadata = { title: "Tus datos y tu privacidad" };

export default async function AcceptPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.privacyAccepted) redirect("/");

  return (
    <main className="grid min-h-dvh place-items-center bg-surface px-4 py-8">
      <section className="w-full max-w-lg rounded-2xl border border-line bg-bg p-6 shadow-lg sm:p-8">
        <p className="text-sm font-bold tracking-[0.2em] text-link">LOGIAI</p>
        <h1 className="mt-2 text-2xl font-extrabold">Tus datos y tu privacidad</h1>
        <p className="mb-5 mt-1 text-muted">Antes de entrar necesitamos tu autorización para tratar tus datos personales.</p>
        <AcceptForm userId={user.id} version={POLICY_VERSION} blockedDelete={user.isAdmin || user.isHead} />
      </section>
    </main>
  );
}

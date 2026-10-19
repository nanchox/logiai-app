import type { Metadata } from "next";
import { LegalShell, Terms } from "@/components/legal/Legal";
import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Términos y condiciones" };

export default async function TermsPage() {
  const user = await getCurrentUser();
  return (
    <LegalShell title="Términos y condiciones de uso" back={user ? { href: "/perfil", label: "Mi perfil" } : { href: "/login", label: "Ingresar" }}>
      <Terms />
    </LegalShell>
  );
}

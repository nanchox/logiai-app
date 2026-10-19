import type { Metadata } from "next";
import { LegalShell, PrivacyPolicy } from "@/components/legal/Legal";
import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Política de tratamiento de datos" };

export default async function PolicyPage() {
  const user = await getCurrentUser();
  return (
    <LegalShell title="Política de tratamiento de datos personales" back={user ? { href: "/perfil", label: "Mi perfil" } : { href: "/login", label: "Ingresar" }}>
      <PrivacyPolicy />
    </LegalShell>
  );
}

"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { btnPrimary, ErrorText } from "@/components/manual/ui";
import { DeleteAccount } from "@/components/profile/DeleteAccount";
import { createClient } from "@/lib/supabase/client";
import { acceptPolicy } from "@/lib/profile/mutations";

/** Aceptación obligatoria la primera vez (y cuando cambien los textos): autorización previa, expresa e informada. */
export function AcceptForm({ userId, version, blockedDelete }: { userId: string; version: string; blockedDelete: boolean }) {
  const sb = useMemo(() => createClient(), []);
  const router = useRouter();
  const [data, setData] = useState(false);
  const [terms, setTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!data || !terms) return;
    setBusy(true);
    setError(null);
    try {
      await acceptPolicy(sb, userId, version);
      router.replace("/");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  const box = "mt-0.5 h-5 w-5 shrink-0 accent-[var(--primary)]";
  return (
    <div className="space-y-4">
    <form onSubmit={submit} className="space-y-4" aria-label="Aceptar política de datos y términos">
      <ul className="list-disc space-y-1 pl-5 text-sm">
        <li>Usamos tu nombre, foto y correo de Google, y tu sede, grupo, rol y posiciones, solo para organizar el servicio.</li>
        <li>Tu correo es privado: solo lo ven tú y quien te administra.</li>
        <li>No vendemos tus datos ni los usamos para publicidad.</li>
        <li>Puedes ver, descargar y <strong>eliminar tu cuenta cuando quieras</strong> desde tu Perfil.</li>
      </ul>
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" className={box} checked={data} onChange={(e) => setData(e.target.checked)} />
        <span>
          Autorizo de manera previa, expresa e informada el tratamiento de mis datos personales, incluidos los que pueden revelar mis convicciones religiosas (dato sensible,
          cuya autorización es facultativa), y su transmisión y transferencia a los proveedores descritos, conforme a la{" "}
          <Link href="/politica" target="_blank" rel="noreferrer">Política de tratamiento de datos personales</Link> (Ley 1581 de 2012).
        </span>
      </label>
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" className={box} checked={terms} onChange={(e) => setTerms(e.target.checked)} />
        <span>He leído y acepto los <Link href="/terminos" target="_blank" rel="noreferrer">Términos y condiciones</Link> de uso.</span>
      </label>
      <ErrorText error={error} />
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className={btnPrimary} disabled={!data || !terms || busy}>Aceptar y continuar</button>
      </div>
    </form>
      <div className="space-y-2 border-t border-line pt-4 text-sm text-muted">
        <p>Si no aceptas, no podemos darte acceso a la aplicación. Puedes salir ahora o eliminar tu cuenta.</p>
        <div className="flex flex-wrap items-center gap-3">
          <form action="/auth/signout" method="post">
            <button type="submit" className="rounded-lg border border-line bg-surface px-3 py-2 text-sm font-semibold text-fg hover:border-primary">No acepto: salir</button>
          </form>
          <DeleteAccount blocked={blockedDelete} />
        </div>
      </div>
    </div>
  );
}

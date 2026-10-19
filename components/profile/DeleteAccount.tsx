"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { btnDanger, ErrorText, input, ModalDialog } from "@/components/manual/ui";
import { createClient } from "@/lib/supabase/client";
import { deleteMyAccount } from "@/lib/profile/mutations";

/** Baja de la cuenta por la propia persona (revocatoria de la autorización y supresión de sus datos). */
export function DeleteAccount({ blocked }: { blocked: boolean }) {
  const sb = useMemo(() => createClient(), []);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [word, setWord] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await deleteMyAccount(sb);
      router.replace("/login?baja=1");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  if (blocked) return <p className="text-sm text-muted">El administrador y la cabeza de ministerio no pueden eliminarse a sí mismos: pide a otro administrador que elimine tu cuenta.</p>;
  return (
    <>
      <button type="button" className={btnDanger} onClick={() => { setWord(""); setError(null); setOpen(true); }}>Eliminar mi cuenta</button>
      <ModalDialog open={open} onClose={() => setOpen(false)} title="Eliminar mi cuenta">
        <div className="space-y-3 p-5">
          <h2 className="text-lg font-extrabold">¿Eliminar tu cuenta?</h2>
          <p className="text-sm">
            Se borran de inmediato tu perfil, tu correo, tu pertenencia a grupos y tus asignaciones. <strong>No se puede deshacer.</strong> Para volver, tu coordinador o líder tendría que
            invitarte de nuevo.
          </p>
          <label className="block text-sm" htmlFor="del-word">Escribe <strong>ELIMINAR</strong> para confirmar</label>
          <input id="del-word" className={input} value={word} onChange={(e) => setWord(e.target.value)} autoComplete="off" />
          <ErrorText error={error} />
          <div className="flex justify-end gap-2">
            <button type="button" className="rounded-lg border border-line bg-surface px-3 py-2 text-sm font-semibold" onClick={() => setOpen(false)}>Cancelar</button>
            <button type="button" className={btnDanger} disabled={busy || word.trim().toUpperCase() !== "ELIMINAR"} onClick={confirm}>Eliminar definitivamente</button>
          </div>
        </div>
      </ModalDialog>
    </>
  );
}

"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { btnDanger, ErrorText } from "@/components/manual/ui";
import { createClient } from "@/lib/supabase/client";
import { removeSupporter } from "@/lib/support/mutations";

/** El apoyo se retira solo hasta el día anterior; ese día o después, debe avisar a su coordinador (la base de datos lo hace cumplir). */
export function RetireSupport({ eventId, userId, groupName }: { eventId: string; userId: string; groupName: string }) {
  const sb = useMemo(() => createClient(), []);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="flex flex-col items-end gap-1">
      <button type="button" className={btnDanger} disabled={busy} aria-label={`Retirarme del apoyo a ${groupName}`} onClick={async () => {
        if (!window.confirm(`¿Retirarte como apoyo de ${groupName}? Quedará la vacante abierta para otra persona.`)) return;
        setBusy(true); setError(null);
        try { await removeSupporter(sb, eventId, userId); router.refresh(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
      }}>Retirarme</button>
      <ErrorText error={error} />
    </span>
  );
}

"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { btn, btnPrimary, ErrorText, input, label } from "@/components/manual/ui";
import { createClient } from "@/lib/supabase/client";
import { collectMyData, renameMe } from "@/lib/profile/mutations";

export function RenameForm({ userId, name }: { userId: string; name: string }) {
  const sb = useMemo(() => createClient(), []);
  const router = useRouter();
  const [value, setValue] = useState(name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  return (
    <form className="flex flex-wrap items-end gap-3" aria-label="Mi nombre" onSubmit={async (e) => {
      e.preventDefault();
      setBusy(true); setError(null); setSaved(false);
      try { await renameMe(sb, userId, value); setSaved(true); router.refresh(); } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
    }}>
      <div className="min-w-56 flex-1">
        <label className={label} htmlFor="pf-name">Mi nombre (puedes corregirlo)</label>
        <input id="pf-name" className={input} value={value} maxLength={100} onChange={(e) => { setValue(e.target.value); setSaved(false); }} />
      </div>
      <button type="submit" className={btnPrimary} disabled={busy || value.trim() === name}>Guardar</button>
      {saved && <span role="status" className="text-sm text-muted">Guardado</span>}
      <div className="w-full"><ErrorText error={error} /></div>
    </form>
  );
}

export function DownloadData({ userId, email }: { userId: string; email: string }) {
  const sb = useMemo(() => createClient(), []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <button type="button" className={btn} disabled={busy} onClick={async () => {
        setBusy(true); setError(null);
        try {
          const data = await collectMyData(sb, userId, email);
          const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
          const a = Object.assign(document.createElement("a"), { href: url, download: "mis-datos-logiai.json" });
          document.body.append(a); a.click(); a.remove(); URL.revokeObjectURL(url);
        } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
      }}>Descargar mis datos</button>
      <ErrorText error={error} />
    </div>
  );
}

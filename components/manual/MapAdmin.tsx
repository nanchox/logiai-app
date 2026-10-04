"use client";

import { useState } from "react";
import { ZONE_KIND_LABEL } from "@/lib/labels";
import { createClient } from "@/lib/supabase/client";
import { createMap, createZoneWithMap, deleteMap, renameMap, replaceMapImage } from "@/lib/manual/mutations";
import type { ViewerMap } from "@/lib/manual/types";
import { btn, btnDanger, btnPrimary, ErrorText, input, label } from "./ui";

type Props = { siteSlug: string; locationId: string; maps: ViewerMap[]; current: ViewerMap | null; open?: boolean; onChanged: (focusMapId?: string) => void };

/** Alta, reemplazo, renombrado y baja de mapas y zonas de un espacio. */
export function MapAdmin({ siteSlug, locationId, maps, current, open, onChanged }: Props) {
  const sb = createClient();
  // Abierto desde el inicio si el espacio no tiene mapas; después solo lo cambia el usuario (no se cierra al subir el primero).
  const [initiallyOpen] = useState(!!open);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [kind, setKind] = useState("acomodacion");
  const [file, setFile] = useState<File | null>(null);
  const [rename, setRename] = useState("");
  const hasGeneral = maps.some((m) => m.isGeneral);

  async function run(fn: () => Promise<string | void>) {
    setBusy(true);
    setError(null);
    try { onChanged((await fn()) || undefined); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <details open={initiallyOpen} className="rounded-2xl border border-line bg-surface p-4">
      <summary className="cursor-pointer font-bold">Mapas y zonas de este espacio</summary>
      <div className="mt-4 space-y-5">
        {current && (
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted">Mapa actual: {current.name}</h3>
            <div>
              <label className={label} htmlFor="ma-replace">Reemplazar imagen</label>
              <input id="ma-replace" type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} className="block w-full text-sm"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) run(async () => { await replaceMapImage(sb, siteSlug, locationId, current, f); });
                }} />
              <p className="mt-1 text-xs text-muted">Los pines conservan su lugar (están en porcentajes): usa una imagen con las mismas proporciones.</p>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-48 flex-1">
                <label className={label} htmlFor="ma-rename">Renombrar</label>
                <input id="ma-rename" className={input} value={rename} placeholder={current.name} onChange={(e) => setRename(e.target.value)} />
              </div>
              <button type="button" className={btn} disabled={busy || !rename.trim()} onClick={() => run(async () => { await renameMap(sb, current, rename); setRename(""); })}>Guardar nombre</button>
              <button type="button" className={btnDanger} disabled={busy} onClick={() => {
                const msg = current.zoneId
                  ? `¿Eliminar la zona "${current.name}" y su mapa? Sus posiciones se conservan, sin zona.`
                  : `¿Eliminar el mapa general "${current.name}"? Se pierden los pines que tiene.`;
                if (window.confirm(msg)) run(async () => { await deleteMap(sb, current); });
              }}>Eliminar este mapa</button>
            </div>
          </div>
        )}

        <form className="space-y-3 border-t border-line pt-4" aria-label="Nuevo mapa" onSubmit={(e) => {
          e.preventDefault();
          if (!file) return;
          const isGeneral = !hasGeneral && kind === "general";
          run(async () => {
            let focusId: string | undefined;
            if (isGeneral) focusId = await createMap(sb, siteSlug, locationId, name || "Mapa general", null, file, 0);
            else await createZoneWithMap(sb, siteSlug, locationId, name, kind, file, maps.length);
            setName(""); setFile(null); (e.target as HTMLFormElement).reset();
            return focusId;
          });
        }}>
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted">Agregar mapa</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={label} htmlFor="mn-kind">Qué es</label>
              <select id="mn-kind" className={input} value={kind} onChange={(e) => setKind(e.target.value)}>
                {!hasGeneral && <option value="general">Mapa general del espacio</option>}
                <option value="acomodacion">{`Zona · ${ZONE_KIND_LABEL.acomodacion}`}</option>
                <option value="orientacion">{`Zona · ${ZONE_KIND_LABEL.orientacion}`}</option>
                <option value="otro">Zona · Otra</option>
              </select>
            </div>
            <div>
              <label className={label} htmlFor="mn-name">Nombre</label>
              <input id="mn-name" className={input} value={name} required={kind !== "general"} placeholder={kind === "general" ? "Mapa general" : "Zona 7"} onChange={(e) => setName(e.target.value)} />
            </div>
          </div>
          <div>
            <label className={label} htmlFor="mn-file">Imagen (PNG, JPG o WebP)</label>
            <input id="mn-file" type="file" accept="image/png,image/jpeg,image/webp" required className="block w-full text-sm" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
          <ErrorText error={error} />
          <button className={btnPrimary} disabled={busy || !file}>{busy ? "Subiendo…" : "Agregar mapa"}</button>
        </form>
      </div>
    </details>
  );
}

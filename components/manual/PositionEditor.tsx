"use client";

import { useState } from "react";
import { DAY_LABEL, SHIFT_LABEL } from "@/lib/labels";
import { createClient } from "@/lib/supabase/client";
import { addLinkMedia, addPhoto, deleteMedia, deletePosition, savePosition } from "@/lib/manual/mutations";
import type { PositionKind, ViewerMedia, ViewerPosition, ViewerZone } from "@/lib/manual/types";
import { parseYouTubeId, youtubeThumbUrl } from "@/lib/youtube";
import { btn, btnDanger, btnPrimary, ErrorText, input, label, ModalDialog } from "./ui";

const DAYS = ["miercoles", "sabado", "domingo"];
const SHIFTS = ["am", "pm", "unica"];

type Props = {
  open: boolean;
  /** null = crear una posición nueva. */
  position: ViewerPosition | null;
  siteSlug: string;
  locationId: string;
  zones: ViewerZone[];
  nextCode: string;
  onClose: () => void;
  /** Se llama tras cualquier cambio para recargar los datos. `createdId` solo al crear. */
  onChanged: (createdId?: string) => void;
};

export function PositionEditor(props: Props) {
  // Se reinicia el formulario al cambiar de posición.
  return (
    <ModalDialog open={props.open} onClose={props.onClose} size="lg" title={props.position ? "Editar posición" : "Nueva posición"}>
      {props.open && <Form key={props.position?.id ?? "new"} {...props} />}
    </ModalDialog>
  );
}

function Form({ position, siteSlug, locationId, zones, nextCode, onClose, onChanged }: Props) {
  const sb = createClient();
  const [f, setF] = useState({
    code: position?.code ?? nextCode,
    name: position?.name ?? "",
    kind: (position?.kind ?? "voluntario") as PositionKind,
    zoneId: position?.zoneId ?? "",
    description: position?.description ?? "",
    usesRadio: position?.usesRadio ?? false,
    days: position?.days ?? [],
    shifts: position?.shifts ?? [],
    isActive: position?.isActive ?? true,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toggle = (key: "days" | "shifts", v: string) =>
    setF((s) => ({ ...s, [key]: s[key].includes(v) ? s[key].filter((x) => x !== v) : [...s[key], v] }));

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try { await fn(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    return run(async () => {
      const id = await savePosition(sb, locationId, { ...f, zoneId: f.zoneId || null }, position?.id);
      onChanged(position ? undefined : id);
      if (position) onClose();
    });
  };

  return (
    <div className="flex max-h-[90vh] flex-col">
      <div className="space-y-6 overflow-y-auto p-6">
        <h2 className="text-xl font-extrabold text-link">{position ? `Editar · ${position.name}` : "Nueva posición"}</h2>

        <form onSubmit={save} className="space-y-4" aria-label="Datos de la posición">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={label} htmlFor="pe-code">Código</label>
              <input id="pe-code" className={input} value={f.code} required onChange={(e) => setF({ ...f, code: e.target.value })} />
            </div>
            <div className="col-span-2">
              <label className={label} htmlFor="pe-name">Nombre</label>
              <input id="pe-name" className={input} value={f.name} required placeholder="PUESTO #2" onChange={(e) => setF({ ...f, name: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label} htmlFor="pe-kind">Tipo</label>
              <select id="pe-kind" className={input} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as PositionKind })}>
                <option value="voluntario">Voluntario</option>
                <option value="supervisor">Supervisor</option>
              </select>
            </div>
            <div>
              <label className={label} htmlFor="pe-zone">Zona</label>
              <select id="pe-zone" className={input} value={f.zoneId} onChange={(e) => setF({ ...f, zoneId: e.target.value })}>
                <option value="">Varias zonas / ninguna</option>
                {zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className={label} htmlFor="pe-desc">Descripción e indicaciones</label>
            <textarea id="pe-desc" className={`${input} min-h-32`} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
          </div>
          <fieldset>
            <legend className={label}>Aplica a (sin marcar = todos)</legend>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {DAYS.map((d) => (
                <label key={d} className="flex items-center gap-1.5"><input type="checkbox" checked={f.days.includes(d)} onChange={() => toggle("days", d)} />{DAY_LABEL[d]}</label>
              ))}
              <span className="text-muted">·</span>
              {SHIFTS.map((s) => (
                <label key={s} className="flex items-center gap-1.5"><input type="checkbox" checked={f.shifts.includes(s)} onChange={() => toggle("shifts", s)} />{SHIFT_LABEL[s] || "Única"}</label>
              ))}
            </div>
          </fieldset>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={f.usesRadio} onChange={(e) => setF({ ...f, usesRadio: e.target.checked })} />📻 Usa radio</label>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={f.isActive} onChange={(e) => setF({ ...f, isActive: e.target.checked })} />Visible para el equipo</label>
          </div>
          <ErrorText error={error} />
          <div className="flex flex-wrap gap-2">
            <button className={btnPrimary} disabled={busy}>{position ? "Guardar cambios" : "Crear posición"}</button>
            {position && (
              <button type="button" className={btnDanger} disabled={busy} onClick={() => {
                if (!window.confirm(`¿Eliminar "${position.name}" con sus fotos, videos y pines? No se puede deshacer.`)) return;
                run(async () => { await deletePosition(sb, position.id); onChanged(); onClose(); });
              }}>Eliminar posición</button>
            )}
          </div>
        </form>

        {position ? (
          <MediaManager position={position} siteSlug={siteSlug} onChanged={() => onChanged()} />
        ) : (
          <p className="rounded-lg border border-line bg-surface p-3 text-sm text-muted">Crea la posición para poder agregarle fotos, videos y enlaces.</p>
        )}
      </div>
      <button type="button" onClick={onClose} className="shrink-0 bg-wine p-4 font-bold text-white">CERRAR</button>
    </div>
  );
}

function MediaManager({ position, siteSlug, onChanged }: { position: ViewerPosition; siteSlug: string; onChanged: () => void }) {
  const sb = createClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [url, setUrl] = useState("");

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try { await fn(); onChanged(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  const remove = (m: ViewerMedia) => run(() => deleteMedia(sb, m));

  return (
    <section aria-label="Fotos, videos y enlaces" className="space-y-4 border-t border-line pt-5">
      <h3 className="text-sm font-extrabold">Fotos, videos y enlaces</h3>
      {position.media.length === 0 && <p className="text-sm text-muted">Todavía no hay medios.</p>}
      <ul className="space-y-2">
        {position.media.map((m) => (
          <li key={m.id} className="flex items-center gap-3 rounded-xl border border-line bg-surface p-2">
            <MediaThumb media={m} />
            <span className="min-w-0 flex-1 text-sm">
              <span className="block font-semibold">{m.kind === "foto" ? "Foto" : m.kind === "youtube" ? "Video de YouTube" : "Enlace"}</span>
              <span className="block truncate text-muted">{m.caption || (m.kind === "foto" ? m.path?.split("/").pop() : m.url)}</span>
            </span>
            <button type="button" className={btnDanger} disabled={busy} onClick={() => remove(m)} aria-label={`Quitar ${m.kind}`}>Quitar</button>
          </li>
        ))}
      </ul>

      <div className="space-y-3 rounded-xl border border-line p-3">
        <div>
          <label className={label} htmlFor="me-caption">Descripción corta (opcional)</label>
          <input id="me-caption" className={input} value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Vista desde la entrada" />
        </div>
        <div>
          <label className={label} htmlFor="me-photo">Subir foto</label>
          <input
            id="me-photo" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} className="block w-full text-sm"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) run(async () => { await addPhoto(sb, siteSlug, position.id, file, caption); setCaption(""); });
            }}
          />
        </div>
        <div>
          <label className={label} htmlFor="me-url">Enlace de YouTube o enlace web</label>
          <div className="flex gap-2">
            <input id="me-url" className={input} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://youtu.be/…" inputMode="url" />
          </div>
          <div className="mt-2 flex gap-2">
            <button type="button" className={btn} disabled={busy || !url} onClick={() => run(async () => { await addLinkMedia(sb, position.id, "youtube", url, caption); setUrl(""); setCaption(""); })}>Agregar video</button>
            <button type="button" className={btn} disabled={busy || !url} onClick={() => run(async () => { await addLinkMedia(sb, position.id, "link", url, caption); setUrl(""); setCaption(""); })}>Agregar enlace</button>
          </div>
        </div>
        <ErrorText error={error} />
        {busy && <p className="text-sm text-muted" role="status">Procesando…</p>}
      </div>
    </section>
  );
}

function MediaThumb({ media: m }: { media: ViewerMedia }) {
  const ytId = m.kind === "youtube" && m.url ? parseYouTubeId(m.url) : null;
  const src = m.kind === "foto" ? m.url : ytId ? youtubeThumbUrl(ytId) : null;
  return (
    <span className="grid h-14 w-20 shrink-0 place-items-center overflow-hidden rounded-lg bg-black text-xl text-white">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- URL firmada de Storage o miniatura de YouTube
        <img src={src} alt="" className="h-full w-full object-cover" />
      ) : m.kind === "link" ? "🔗" : "▶"}
    </span>
  );
}

"use client";

import { useState } from "react";
import { formatDateTime } from "@/lib/announcements/dates";
import { scopeLabel, type AnnouncementItem } from "@/lib/announcements/types";
import { ModalDialog } from "@/components/manual/ui";
import { AnnouncementCard, CategoryBadge } from "./AnnouncementCard";

const snippet = (t: string, n = 140) => { const s = t.replace(/\s+/g, " ").trim(); return s.length > n ? `${s.slice(0, n).trimEnd()}…` : s; };

/** Novedades del inicio: tarjetas resumidas; al tocar una se abre su detalle completo (texto, imágenes y enlaces) en una ventana. */
export function RecentAnnouncements({ items }: { items: AnnouncementItem[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const cur = items.find((a) => a.id === openId) ?? null;
  return (
    <>
      <ul className="space-y-3">
        {items.map((a) => (
          <li key={a.id}>
            <article aria-label={a.title} className={`relative rounded-2xl border bg-surface p-5 hover:border-primary ${a.pinned ? "border-accent" : "border-line"}`}>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {a.pinned && <span className="font-bold">📌 Fijado</span>}
                <CategoryBadge category={a.category} />
                <span className="rounded-full border border-line px-2.5 py-0.5 font-semibold">{scopeLabel(a)}</span>
                {a.images.length > 0 && <span className="text-muted" aria-label={`${a.images.length} imágenes`}>🖼 {a.images.length}</span>}
              </div>
              <h2 className="mt-2 text-base font-extrabold">
                {/* El botón cubre toda la tarjeta: se puede tocar en cualquier parte */}
                <button type="button" onClick={() => setOpenId(a.id)} className="text-left text-link after:absolute after:inset-0 after:content-[''] focus-visible:after:rounded-2xl" aria-label={`Ver detalle: ${a.title}`}>{a.title}</button>
              </h2>
              {a.body && <p className="mt-1 text-sm text-muted">{snippet(a.body)}</p>}
              <p className="mt-2 flex items-center justify-between gap-2 text-xs text-muted">
                <span>Publicado {formatDateTime(a.startsAt)}</span>
                <span className="font-semibold text-link" aria-hidden>Ver detalle →</span>
              </p>
            </article>
          </li>
        ))}
      </ul>
      <ModalDialog open={cur !== null} onClose={() => setOpenId(null)} size="lg" title={cur ? `Novedad: ${cur.title}` : "Novedad"}>
        {cur && (
          <div className="flex max-h-[90vh] flex-col">
            <div className="overflow-y-auto p-4"><AnnouncementCard a={cur} /></div>
            <button type="button" onClick={() => setOpenId(null)} className="shrink-0 bg-deep p-4 font-bold text-white">CERRAR</button>
          </div>
        )}
      </ModalDialog>
    </>
  );
}

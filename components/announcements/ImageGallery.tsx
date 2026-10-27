"use client";

import { useState } from "react";
import { ModalDialog } from "@/components/manual/ui";
import type { AnnouncementImage } from "@/lib/announcements/types";

/** Imágenes de una novedad, visibles en la tarjeta. Al tocar una se ve completa. */
export function ImageGallery({ images, title }: { images: AnnouncementImage[]; title: string }) {
  const [open, setOpen] = useState<number | null>(null);
  if (!images.length) return null;
  const cur = open !== null ? images[open] : null;
  return (
    <>
      <ul className={`mt-3 grid gap-2 ${images.length === 1 ? "" : "sm:grid-cols-2"}`} aria-label="Imágenes">
        {images.map((im, i) => (
          <li key={im.id}>
            <button type="button" onClick={() => setOpen(i)} className="block w-full overflow-hidden rounded-xl border border-line bg-bg" aria-label={`Ver imagen ${i + 1} de ${images.length}: ${title}`}>
              {/* eslint-disable-next-line @next/next/no-img-element -- imagen firmada y privada: next/image no aplica */}
              <img src={im.url} alt={`Imagen ${i + 1} de «${title}»`} loading="lazy" className="max-h-96 w-full object-contain" />
            </button>
          </li>
        ))}
      </ul>
      <ModalDialog open={open !== null} onClose={() => setOpen(null)} size="xl" title={`Imagen de ${title}`}>
        {cur && (
          <div className="flex max-h-[95vh] flex-col">
            {/* eslint-disable-next-line @next/next/no-img-element -- imagen firmada y privada */}
            <img src={cur.url} alt={`Imagen ampliada de «${title}»`} className="min-h-0 flex-1 object-contain" />
            <button type="button" onClick={() => setOpen(null)} className="shrink-0 bg-deep p-4 font-bold text-white">CERRAR</button>
          </div>
        )}
      </ModalDialog>
    </>
  );
}

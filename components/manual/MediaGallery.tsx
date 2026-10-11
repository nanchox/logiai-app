"use client";

import { useState } from "react";
import { parseYouTubeId, youtubeEmbedUrl, youtubeThumbUrl } from "@/lib/youtube";
import type { ViewerMedia } from "@/lib/manual/types";
import { ModalDialog } from "./ui";

/** Video de YouTube: primero una miniatura; el iframe (youtube-nocookie) solo se carga al pulsar play. */
export function YouTubeEmbed({ url, caption }: { url: string; caption?: string | null }) {
  const id = parseYouTubeId(url);
  const [playing, setPlaying] = useState(false);
  if (!id) return <a href={url} target="_blank" rel="noreferrer noopener">{caption || url}</a>;
  return (
    <figure>
      <div className="relative aspect-video overflow-hidden rounded-xl bg-black">
        {playing ? (
          <iframe
            src={youtubeEmbedUrl(id)}
            title={caption || "Video de YouTube"}
            className="absolute inset-0 h-full w-full"
            allow="accelerometer; autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        ) : (
          <button type="button" onClick={() => setPlaying(true)} aria-label={`Reproducir video${caption ? `: ${caption}` : ""}`} className="group absolute inset-0">
            {/* eslint-disable-next-line @next/next/no-img-element -- miniatura pública de YouTube */}
            <img src={youtubeThumbUrl(id)} alt="" loading="lazy" className="h-full w-full object-cover opacity-90 group-hover:opacity-100" />
            <span className="absolute inset-0 grid place-items-center">
              <span className="grid h-14 w-14 place-items-center rounded-full bg-danger text-2xl text-white shadow-lg">▶</span>
            </span>
          </button>
        )}
      </div>
      {caption && <figcaption className="mt-1 text-sm text-muted">{caption}</figcaption>}
    </figure>
  );
}

const host = (u: string) => {
  try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; }
};

export function MediaGallery({ media }: { media: ViewerMedia[] }) {
  const [zoom, setZoom] = useState<ViewerMedia | null>(null);
  const photos = media.filter((m) => m.kind === "foto" && m.url);
  const videos = media.filter((m) => m.kind === "youtube" && m.url);
  const links = media.filter((m) => m.kind === "link" && m.url);
  if (!photos.length && !videos.length && !links.length) return null;

  return (
    <div className="mt-5 space-y-4">
      {photos.length > 0 && (
        <section aria-label="Fotos">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">Fotos</h3>
          <ul className="grid grid-cols-2 gap-2">
            {photos.map((m) => (
              <li key={m.id}>
                <button type="button" onClick={() => setZoom(m)} className="block w-full overflow-hidden rounded-xl border border-line" aria-label={`Ampliar foto${m.caption ? `: ${m.caption}` : ""}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- URL firmada de Supabase Storage */}
                  <img src={m.url!} alt={m.caption ?? "Foto de la posición"} loading="lazy" className="aspect-[4/3] w-full object-cover" />
                </button>
                {m.caption && <p className="mt-1 text-xs text-muted">{m.caption}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
      {videos.length > 0 && (
        <section aria-label="Videos" className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted">Videos</h3>
          {videos.map((m) => <YouTubeEmbed key={m.id} url={m.url!} caption={m.caption} />)}
        </section>
      )}
      {links.length > 0 && (
        <section aria-label="Enlaces">
          <h3 className="mb-1 text-xs font-bold uppercase tracking-wider text-muted">Enlaces</h3>
          <ul className="space-y-1">
            {links.map((m) => (
              <li key={m.id}><a href={m.url!} target="_blank" rel="noreferrer noopener">{m.caption || host(m.url!)} ↗</a></li>
            ))}
          </ul>
        </section>
      )}
      <ModalDialog open={!!zoom} onClose={() => setZoom(null)} size="xl" title="Foto ampliada">
        {zoom && (
          <div className="p-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- URL firmada de Supabase Storage */}
            <img src={zoom.url!} alt={zoom.caption ?? "Foto de la posición"} className="mx-auto max-h-[80vh] w-auto rounded-lg" />
            {zoom.caption && <p className="mt-2 text-center text-sm">{zoom.caption}</p>}
            <button type="button" onClick={() => setZoom(null)} className="mt-3 w-full rounded-lg bg-wine p-3 font-bold text-white">CERRAR</button>
          </div>
        )}
      </ModalDialog>
    </div>
  );
}

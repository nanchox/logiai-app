"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { ModalDialog } from "@/components/manual/ui";
import { parseYouTubeId, youtubeEmbedUrl } from "@/lib/youtube";

/** Un enlace https que se abre en una ventana dentro de la aplicación. Desde ahí se puede abrir en el navegador. Con ctrl/⌘/clic central se comporta como un enlace normal. */
export function ExternalLink({ href, children, className, ...rest }: { href: string; children: React.ReactNode; className?: string } & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "className" | "children">) {
  const [open, setOpen] = useState(false);
  const yt = parseYouTubeId(href);
  let host = href;
  try { host = new URL(href).hostname.replace(/^www\./, ""); } catch { /* se muestra tal cual */ }

  return (
    <>
      <a
        {...rest}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
          e.preventDefault();
          setOpen(true);
        }}
      >
        {children}
      </a>
      {open && createPortal(
      <ModalDialog open={open} onClose={() => setOpen(false)} size="xl" title={`Enlace: ${host}`}>
        <div className="flex h-[85vh] flex-col bg-bg text-fg">
          <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface p-3">
            <p className="min-w-0 flex-1 truncate text-sm font-semibold" title={href}>{host}</p>
            <a href={href} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-line bg-bg px-3 py-2 text-sm font-bold no-underline hover:border-primary">Abrir en el navegador ↗</a>
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg bg-deep px-3 py-2 text-sm font-bold text-white">Cerrar</button>
          </div>
          <iframe
            title={`Contenido de ${host}`}
            src={yt ? youtubeEmbedUrl(yt) : href}
            className="min-h-0 w-full flex-1 bg-white"
            referrerPolicy="no-referrer"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-presentation"
            allow="fullscreen; autoplay; encrypted-media"
            allowFullScreen
          />
          <p className="border-t border-line bg-surface p-2 text-center text-xs text-muted">¿No carga? Algunas páginas no permiten verse aquí: usa «Abrir en el navegador».</p>
        </div>
      </ModalDialog>, document.body)}
    </>
  );
}

"use client";

import { DAY_LABEL, SHIFT_LABEL } from "@/lib/labels";
import type { ViewerPosition } from "@/lib/manual/types";
import { MediaGallery } from "./MediaGallery";
import { ModalDialog } from "./ui";

export const scopeText = (p: Pick<ViewerPosition, "days" | "shifts">) =>
  [p.days.map((d) => DAY_LABEL[d] ?? d).join(", "), p.shifts.map((s) => SHIFT_LABEL[s] || "Única").join(", ")].filter(Boolean).join(" · ");

/** Ficha de una posición: descripción, a quién aplica, fotos, videos y enlaces. */
export function PositionSheet({ position, onClose }: { position: ViewerPosition | null; onClose: () => void }) {
  return (
    <ModalDialog open={!!position} onClose={onClose} title={position?.name ?? "Posición"} size="lg">
      {position && (
        <div className="flex max-h-[80vh] flex-col">
          <div className="overflow-y-auto p-6">
            <h2 className="text-xl font-extrabold text-link">{position.name}</h2>
            <p className="mb-3 mt-1 flex flex-wrap items-center gap-2 text-xs font-bold uppercase text-muted">
              <span>{position.kind === "supervisor" ? "Supervisor" : "Voluntario"}</span>
              {position.zoneName && <span>· {position.zoneName}</span>}
              {position.usesRadio && <span className="rounded-full bg-bronze px-2 py-0.5 text-on-bronze">📻 Radio</span>}
              {!position.isActive && <span className="rounded-full border border-line px-2 py-0.5">Oculta</span>}
            </p>
            <p className="whitespace-pre-line leading-relaxed">{position.description || <span className="text-muted">Sin descripción todavía.</span>}</p>
            <p className="mt-4 text-sm text-muted">Aplica: {scopeText(position) || "todos los días y franjas"}</p>
            <MediaGallery media={position.media} />
          </div>
          <button type="button" onClick={onClose} className="shrink-0 bg-wine p-4 font-bold text-white">CERRAR</button>
        </div>
      )}
    </ModalDialog>
  );
}

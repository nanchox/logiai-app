"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { DAY_LABEL, SHIFT_LABEL } from "@/lib/labels";

export type ViewerMap = { id: string; name: string; isGeneral: boolean; url: string | null };
export type ViewerPosition = {
  id: string; code: string; name: string; kind: "supervisor" | "voluntario"; description: string;
  usesRadio: boolean; zoneName: string | null; days: string[]; shifts: string[];
};
export type ViewerMarker = { positionId: string; mapId: string; variant: "desktop" | "mobile"; top: number; left: number };

const MOBILE_QUERY = "(max-width: 768px)";
const subscribeMobile = (cb: () => void) => {
  const mq = window.matchMedia(MOBILE_QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};
const useIsMobile = () =>
  useSyncExternalStore(subscribeMobile, () => window.matchMedia(MOBILE_QUERY).matches, () => false);

const appliesTo = (p: ViewerPosition) =>
  [p.days.map((d) => DAY_LABEL[d] ?? d).join(", "), p.shifts.map((s) => SHIFT_LABEL[s] || "Única").join(", ")]
    .filter(Boolean).join(" · ");

export function MapViewer({ maps, positions, markers }: { maps: ViewerMap[]; positions: ViewerPosition[]; markers: ViewerMarker[] }) {
  const [mapId, setMapId] = useState(maps[0].id);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const isMobile = useIsMobile();
  const dialogRef = useRef<HTMLDialogElement>(null);

  const map = maps.find((m) => m.id === mapId) ?? maps[0];
  const byId = useMemo(() => new Map(positions.map((p) => [p.id, p])), [positions]);

  // Un pin por posición en este mapa; en móvil se prefiere la variante móvil si existe.
  const pins = useMemo(() => {
    const out = new Map<string, ViewerMarker>();
    for (const m of markers.filter((m) => m.mapId === map.id)) {
      const current = out.get(m.positionId);
      const preferred = isMobile ? "mobile" : "desktop";
      if (!current || m.variant === preferred) out.set(m.positionId, m);
    }
    return [...out.values()].filter((m) => byId.has(m.positionId));
  }, [markers, map.id, isMobile, byId]);

  const selected = selectedId ? byId.get(selectedId) ?? null : null;
  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (selected && !d.open) d.showModal();
    if (!selected && d.open) d.close();
  }, [selected]);

  const listed = pins.map((p) => byId.get(p.positionId)!).sort((a, b) => Number(a.code) - Number(b.code));

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Mapas" className="flex gap-2 overflow-x-auto pb-1">
        {maps.map((m) => (
          <button
            key={m.id}
            role="tab"
            aria-selected={m.id === map.id}
            onClick={() => setMapId(m.id)}
            className={`shrink-0 rounded-full border px-4 py-2 text-sm font-bold ${
              m.id === map.id ? "border-accent bg-accent text-on-accent" : "border-line bg-surface hover:border-primary"
            }`}
          >
            {m.name}
          </button>
        ))}
      </div>

      <div className="overflow-auto rounded-2xl border border-line bg-black" tabIndex={0} aria-label={`Mapa: ${map.name}`}>
        {map.url ? (
          <div className={`relative mx-auto ${map.isGeneral ? "min-w-[720px]" : ""}`} style={{ width: "100%" }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- URL firmada y temporal de Supabase Storage */}
            <img src={map.url} alt={`Plano: ${map.name}`} className="block h-auto w-full select-none" draggable={false} />
            {pins.map((m) => {
              const p = byId.get(m.positionId)!;
              const sup = p.kind === "supervisor";
              return (
                <button
                  key={m.positionId}
                  onClick={() => setSelectedId(p.id)}
                  aria-label={`${p.name}${p.zoneName ? `, ${p.zoneName}` : ""}`}
                  style={{ top: `${m.top}%`, left: `${m.left}%` }}
                  className={`absolute grid h-7 w-7 -translate-x-1/2 -translate-y-1/2 place-items-center border-2 border-white text-xs font-black shadow-lg sm:h-10 sm:w-10 sm:text-sm ${
                    sup ? "rounded-lg bg-danger text-white" : "rounded-full bg-info text-on-info"
                  }`}
                >
                  {p.code}
                </button>
              );
            })}
          </div>
        ) : (
          <p className="p-8 text-center text-white/80">La imagen de este mapa aún no se ha cargado.</p>
        )}
      </div>

      <section aria-label="Posiciones en este mapa">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-muted">Posiciones en este mapa ({listed.length})</h2>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {listed.map((p) => (
            <li key={p.id}>
              <button onClick={() => setSelectedId(p.id)} className="flex w-full items-center gap-3 rounded-xl border border-line bg-surface p-3 text-left hover:border-primary">
                <span className={`grid h-8 w-8 shrink-0 place-items-center text-xs font-black ${p.kind === "supervisor" ? "rounded-md bg-danger text-white" : "rounded-full bg-info text-on-info"}`}>{p.code}</span>
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{p.name}</span>
                  {p.zoneName && <span className="block text-xs text-muted">{p.zoneName}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <dialog ref={dialogRef} className="sheet" onClose={() => setSelectedId(null)} onClick={(e) => e.target === dialogRef.current && setSelectedId(null)}>
        {selected && (
          <div className="flex max-h-[80vh] flex-col">
            <div className="overflow-y-auto p-6">
              <h2 className="text-xl font-extrabold text-link">{selected.name}</h2>
              <p className="mb-3 mt-1 flex flex-wrap items-center gap-2 text-xs font-bold uppercase text-muted">
                <span>{selected.kind === "supervisor" ? "Supervisor" : "Voluntario"}</span>
                {selected.zoneName && <span>· {selected.zoneName}</span>}
                {selected.usesRadio && <span className="rounded-full bg-bronze px-2 py-0.5 text-on-bronze">📻 Radio</span>}
              </p>
              <p className="whitespace-pre-line leading-relaxed">{selected.description}</p>
              {appliesTo(selected) && <p className="mt-4 text-sm text-muted">Aplica: {appliesTo(selected)}</p>}
            </div>
            <button onClick={() => setSelectedId(null)} className="shrink-0 bg-wine p-4 font-bold text-white">CERRAR</button>
          </div>
        )}
      </dialog>
    </div>
  );
}

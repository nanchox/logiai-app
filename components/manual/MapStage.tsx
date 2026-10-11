"use client";

import { useRef } from "react";
import type { PositionKind } from "@/lib/manual/types";

export type Pin = {
  key: string; positionId: string; code: string; kind: PositionKind; top: number; left: number;
  /** En móvil, pin heredado del de escritorio (todavía no tiene el suyo). */
  inherited?: boolean;
  dim?: boolean;
  selected?: boolean;
  label: string;
};

type Props = {
  url: string | null;
  name: string;
  general: boolean;
  pins: Pin[];
  editable: boolean;
  placing: boolean;
  onPinClick: (positionId: string) => void;
  onPinMove: (positionId: string, top: number, left: number) => void;
  onPlace: (top: number, left: number) => void;
};

const round = (n: number) => Math.min(100, Math.max(0, Math.round(n * 100) / 100));

export function MapStage({ url, name, general, pins, editable, placing, onPinClick, onPinMove, onPlace }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; x: number; y: number; moved: boolean } | null>(null);

  const toPct = (clientX: number, clientY: number) => {
    const r = wrapRef.current!.getBoundingClientRect();
    return { top: round(((clientY - r.top) / r.height) * 100), left: round(((clientX - r.left) / r.width) * 100) };
  };

  if (!url) {
    return <p className="rounded-2xl border border-line bg-surface p-8 text-center text-muted">La imagen de este mapa aún no se ha cargado.</p>;
  }

  return (
    <div className="overflow-auto rounded-2xl border border-line bg-black" tabIndex={0} aria-label={`Mapa: ${name}`}>
      <div
        ref={wrapRef}
        className={`relative mx-auto w-full ${general ? "min-w-[720px]" : ""} ${placing ? "cursor-crosshair" : ""}`}
        onClick={(e) => {
          if (!placing) return;
          const p = toPct(e.clientX, e.clientY);
          onPlace(p.top, p.left);
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- URL firmada y temporal de Supabase Storage */}
        <img src={url} alt={`Plano: ${name}`} className="block h-auto w-full select-none" draggable={false} />
        {pins.map((p) => {
          const sup = p.kind === "supervisor";
          return (
            <button
              key={p.key}
              type="button"
              data-pin={p.positionId}
              aria-label={p.label}
              aria-pressed={editable ? !!p.selected : undefined}
              style={{ top: `${p.top}%`, left: `${p.left}%` }}
              className={`absolute grid h-7 w-7 -translate-x-1/2 -translate-y-1/2 place-items-center border-2 text-xs font-black shadow-lg sm:h-10 sm:w-10 sm:text-sm ${
                sup ? "rounded-lg bg-danger text-white" : "rounded-full bg-info text-on-info"
              } ${p.selected ? "z-20 border-accent ring-4 ring-accent" : "z-10 border-white"} ${p.dim ? "opacity-50" : ""} ${
                p.inherited ? "border-dashed" : ""
              } ${editable ? "cursor-grab touch-none active:cursor-grabbing" : ""} ${placing ? "pointer-events-none" : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                if (editable && e.detail !== 0) return; // en edición el clic de ratón lo gestiona pointerup
                onPinClick(p.positionId);
              }}
              onPointerDown={(e) => {
                if (!editable) return;
                e.currentTarget.setPointerCapture(e.pointerId);
                drag.current = { id: p.positionId, x: e.clientX, y: e.clientY, moved: false };
              }}
              onPointerMove={(e) => {
                const d = drag.current;
                if (!d || d.id !== p.positionId) return;
                if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 4) return;
                d.moved = true;
                const pt = toPct(e.clientX, e.clientY);
                onPinMove(p.positionId, pt.top, pt.left);
              }}
              onPointerUp={() => {
                const d = drag.current;
                drag.current = null;
                if (d && !d.moved) onPinClick(d.id);
              }}
              onKeyDown={(e) => {
                if (!editable) return;
                const step = e.shiftKey ? 2 : 0.5;
                const move: Record<string, [number, number]> = { ArrowUp: [-step, 0], ArrowDown: [step, 0], ArrowLeft: [0, -step], ArrowRight: [0, step] };
                const m = move[e.key];
                if (!m) return;
                e.preventDefault();
                onPinMove(p.positionId, round(p.top + m[0]), round(p.left + m[1]));
              }}
            >
              {p.code}
            </button>
          );
        })}
      </div>
    </div>
  );
}

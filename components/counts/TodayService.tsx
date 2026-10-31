"use client";

import { useState } from "react";
import Link from "next/link";
import { ActiveBadge } from "@/components/service/ActiveBadge";
import { btn, btnPrimary, ModalDialog } from "@/components/manual/ui";
import { serviceLabel, DAY_LABEL } from "@/lib/labels";
import { formatServiceDate } from "@/lib/service/dates";
import type { CountGuide } from "@/lib/counts/types";
import { CountPanel } from "./CountPanel";

type PanelProps = Omit<React.ComponentProps<typeof CountPanel>, "showGuide" | "guide">;

/** Atajo del día del servicio para el coordinador y el supervisor: la guía de conteo, el manual de la sede y los conteos y reservas en una ventana. */
export function TodayService({
  eventId, date, day, shift, siteName, groupName, manualHref, guide, panel,
}: { eventId: string; date: string; day: string; shift: string; siteName: string; groupName: string | null; manualHref: string; guide: CountGuide | null; panel: PanelProps }) {
  const [open, setOpen] = useState<"guide" | "counts" | null>(null);
  return (
    <section aria-label="Servicio de hoy" className="space-y-3 rounded-2xl border-2 border-accent bg-surface p-4">
      <div>
        <p className="flex flex-wrap items-center gap-2"><ActiveBadge today /><span className="text-xs font-bold uppercase tracking-wider text-muted">Servicio de hoy</span></p>
        <h2 className="mt-1.5 text-lg font-extrabold">{formatServiceDate(date)}</h2>
        <p className="text-sm text-muted">{serviceLabel(day, shift)} · {siteName}{groupName ? ` · ${groupName}` : ""}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={btnPrimary} onClick={() => setOpen("counts")}>Registrar conteos y reservas</button>
        <button type="button" className={btn} onClick={() => setOpen("guide")}>Ver guía de conteo</button>
        <Link href={manualHref} className={`${btn} no-underline`}>Manual de la sede</Link>
        <Link href={`/servicio/${eventId}`} className={`${btn} no-underline`}>Abrir el servicio</Link>
      </div>

      <ModalDialog open={open === "guide"} onClose={() => setOpen(null)} size="xl" title="Guía de conteo">
        <div className="flex max-h-[95vh] flex-col">
          {guide?.url ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element -- imagen firmada y privada: next/image no aplica */}
              <img src={guide.url} alt={`Guía de conteo del ${DAY_LABEL[day] ?? day}`} className="min-h-0 flex-1 bg-white object-contain" />
              {guide.note && <p className="shrink-0 bg-bg p-3 text-sm text-fg">{guide.note}</p>}
            </>
          ) : <p className="bg-bg p-6 text-fg">Todavía no hay una guía de conteo para el {(DAY_LABEL[day] ?? day).toLowerCase()}. Pídela a tu líder de sede.</p>}
          <button type="button" onClick={() => setOpen(null)} className="shrink-0 bg-deep p-4 font-bold text-white">CERRAR</button>
        </div>
      </ModalDialog>

      <ModalDialog open={open === "counts"} onClose={() => setOpen(null)} size="lg" title="Conteos y reservas de hoy">
        <div className="flex max-h-[90vh] flex-col">
          <div className="space-y-3 overflow-y-auto p-4">
            <CountPanel {...panel} guide={guide} showGuide={false} />
          </div>
          <button type="button" onClick={() => setOpen(null)} className="shrink-0 bg-deep p-4 font-bold text-white">CERRAR</button>
        </div>
      </ModalDialog>
    </section>
  );
}

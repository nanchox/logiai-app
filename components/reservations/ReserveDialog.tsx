"use client";

import { useState } from "react";
import Link from "next/link";
import { btn, btnPrimary, ModalDialog } from "@/components/manual/ui";
import type { ReserverMeeting, ReserverZone, SeatReservation } from "@/lib/reservations/types";
import { ReservationForm } from "./ReservationForm";

/** Acceso rápido desde Inicio para registrar una reserva de puestos (administrador, cabeza y líder de sede), sin salir de la pantalla. */
export function ReserveDialog({ zones, mine, today, meetings, canManage }: { zones: ReserverZone[]; mine: SeatReservation[]; today: string; meetings: ReserverMeeting[]; canManage: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="block w-full rounded-2xl border border-line bg-surface p-4 text-left hover:border-primary">
        <span className="text-lg font-bold text-fg">＋ Reservar puestos</span>
        <span className="mt-1 block text-sm text-muted">Fecha, zona, fila, puestos y para quién. Los coordinadores y supervisores la verán.</span>
      </button>
      <ModalDialog open={open} onClose={() => setOpen(false)} size="lg" title="Reservar puestos">
        <div className="flex max-h-[90vh] flex-col">
          <div className="space-y-3 overflow-y-auto p-4">
            <ReservationForm zones={zones} mine={mine} today={today} meetings={meetings} />
            {canManage && <p className="text-sm"><Link href="/personas/reservas" className={`${btn} no-underline`}>Ver y editar todas las reservas →</Link></p>}
          </div>
          <button type="button" onClick={() => setOpen(false)} className={`${btnPrimary} shrink-0 !rounded-none !p-4`}>CERRAR</button>
        </div>
      </ModalDialog>
    </>
  );
}

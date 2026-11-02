// Cupos de las entradas por reunión. Funciones puras: sin base de datos.
import type { Meeting } from "@/lib/service/meetings";
import type { EntranceQuota, EventQuota } from "./types";

/** Cupo de una entrada en una reunión de un servicio: el ajuste del servicio; si no, el estándar de la reunión (o de la estándar de la que viene); si no, ninguno. */
export function effectiveQuota(entranceId: string, meeting: Pick<Meeting, "id" | "baseId">, standard: EntranceQuota[], overrides: EventQuota[]): { quota: number | null; adjusted: boolean; standard: number | null } {
  const std = standard.find((q) => q.entranceId === entranceId && q.meetingId === (meeting.baseId ?? meeting.id))?.quota ?? null;
  const ov = overrides.find((q) => q.entranceId === entranceId && q.meetingId === meeting.id)?.quota;
  return ov !== undefined ? { quota: ov, adjusted: ov !== std, standard: std } : { quota: std, adjusted: false, standard: std };
}

/** Suma de los cupos de un conjunto de entradas en una reunión (las que no tienen cupo cuentan 0). */
export function quotaTotal(entranceIds: string[], meeting: Pick<Meeting, "id" | "baseId">, standard: EntranceQuota[], overrides: EventQuota[]): number {
  return entranceIds.reduce((s, id) => s + (effectiveQuota(id, meeting, standard, overrides).quota ?? 0), 0);
}

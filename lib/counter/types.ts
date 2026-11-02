/** Una entrada que la persona puede contar hoy. */
export type CounterEntrance = {
  eventId: string; date: string; siteName: string; groupName: string | null;
  entranceId: string; entranceName: string; note: string | null; locationName: string;
  /** Tiene una posición de conteo de esta entrada en la planeación (si no, la cuenta por ser quien planifica el servicio). */
  assigned: boolean;
};

export const NO_MEETING = "00000000-0000-0000-0000-000000000000";

/** Estado de una reunión en el contador: cupo (máximo) y conteo actual. `time` nulo = el servicio no tiene reuniones. */
export type CounterMeeting = { meetingId: string; time: string | null; label: string | null; quota: number | null; count: number; locationTotal: number };
export type CounterState = { entranceName: string; note: string | null; locationName: string; capacity: number | null; meetings: CounterMeeting[] };

/** Lo que devuelve apply_entrance_delta. */
export type DeltaResult = { count: number; applied: number; capped: "cero" | "cupo" | "aforo" | null; duplicate: boolean; max?: number | null; locationTotal?: number };

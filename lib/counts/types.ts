export type CountLocation = { id: string; siteId: string; name: string; kind: string; capacity: number | null; sort: number };
export type CountGuide = { siteId: string; day: string; path: string; url: string | null; note: string | null; updatedAt: string };
/** meetingId nulo = total de todo el servicio (registro manual); si no, el total de esa reunión (contador digital). */
export type CountRow = { eventId: string; locationId: string; meetingId?: string | null; total: number };
/** Conteo actual de una entrada en una reunión de un servicio (contador digital). */
export type EntranceCounterRow = { entranceId: string; meetingId: string; count: number };
export type CountLogEntry = { changedAt: string; name: string | null; locationName: string; oldTotal: number | null; newTotal: number | null };
export type ReservationZone = { id: string; siteId: string; locationId: string; locationName: string; name: string; sort: number };
/** meetingId nulo = todas las reuniones del día. */
export type ReservationDefault = { zoneId: string; day: string; meetingId: string | null; seats: number };
export type ReservationOverride = { zoneId: string; meetingId: string | null; seats: number };
export type Entrance = { id: string; locationId: string; name: string; note: string | null; zonesText: string | null; sort: number };
/** Cupo estándar de una entrada en una reunión de un horario. */
export type EntranceQuota = { entranceId: string; meetingId: string; quota: number };
/** Ajuste del cupo de una entrada en una reunión de un servicio concreto. */
export type EventQuota = { entranceId: string; meetingId: string; quota: number };

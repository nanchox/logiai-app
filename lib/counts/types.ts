export type CountLocation = { id: string; siteId: string; name: string; kind: string; capacity: number | null; sort: number };
export type CountGuide = { siteId: string; day: string; path: string; url: string | null; note: string | null; updatedAt: string };
export type CountRow = { eventId: string; locationId: string; total: number };
export type CountLogEntry = { changedAt: string; name: string | null; locationName: string; oldTotal: number | null; newTotal: number | null };
export type ReservationZone = { id: string; siteId: string; locationId: string; locationName: string; name: string; sort: number };
/** meetingId nulo = todas las reuniones del día. */
export type ReservationDefault = { zoneId: string; day: string; meetingId: string | null; seats: number };
export type ReservationOverride = { zoneId: string; meetingId: string | null; seats: number };
export type Entrance = { id: string; locationId: string; name: string; note: string | null; sort: number };
/** Cupo estándar de una entrada en una reunión de un horario. */
export type EntranceQuota = { entranceId: string; meetingId: string; quota: number };
/** Ajuste del cupo de una entrada en una reunión de un servicio concreto. */
export type EventQuota = { entranceId: string; meetingId: string; quota: number };

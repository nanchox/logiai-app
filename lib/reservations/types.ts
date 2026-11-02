export type ReserverZone = { siteId: string; siteName: string; zoneId: string; zoneName: string; locationName: string };
export type SeatReservation = {
  id: string; siteId: string; siteName: string; zoneId: string; zoneName: string; locationId: string; locationName: string;
  date: string; /** «HH:MM» de la reunión; nulo = todas las reuniones del día */ meetingTime: string | null;
  row: string; seats: number; forWhom: string; byName: string | null; mine: boolean;
};
/** Reunión estándar de un día de una sede (para elegir la reunión de una reserva). */
export type ReserverMeeting = { siteId: string; day: string; time: string; label: string | null };

export const MAX_RESERVATION_DAYS = 120;

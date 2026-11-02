export type ReserverZone = { siteId: string; siteName: string; zoneId: string; zoneName: string; locationName: string };
export type SeatReservation = {
  id: string; siteId: string; siteName: string; zoneName: string; locationName: string;
  date: string; row: string; seats: number; forWhom: string; byName: string | null; mine: boolean;
};

export const MAX_RESERVATION_DAYS = 120;

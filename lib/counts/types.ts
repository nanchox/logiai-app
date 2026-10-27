export type CountLocation = { id: string; siteId: string; name: string; kind: string; capacity: number | null; sort: number };
export type CountGuide = { siteId: string; day: string; path: string; url: string | null; note: string | null; updatedAt: string };
export type CountRow = { eventId: string; locationId: string; total: number };
export type CountLogEntry = { changedAt: string; name: string | null; locationName: string; oldTotal: number | null; newTotal: number | null };

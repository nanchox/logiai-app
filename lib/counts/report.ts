// Armado del reporte de conteos. Funciones puras: reciben lo que la base de datos dejó ver a la persona y calculan totales.
import type { ServiceEvent } from "@/lib/service/types";
import type { CountLocation, CountRow } from "./types";

export type ReportItem = { locationId: string; name: string; capacity: number | null; total: number | null };
export type ServiceReport = {
  event: ServiceEvent;
  items: ReportItem[];
  total: number;
  /** Capacidad de las ubicaciones que sí se contaron: así una ubicación que no se usó no baja el porcentaje. */
  capacity: number;
  occupancy: number | null;
  hasCounts: boolean;
  /** Ya pasó (o es hoy) y no tiene ningún total registrado. */
  pending: boolean;
};
export type DayReport = { date: string; services: ServiceReport[]; total: number; capacity: number; occupancy: number | null };
export type SiteReport = {
  siteId: string; siteName: string; days: DayReport[]; total: number; capacity: number; occupancy: number | null; services: number; counted: number; pending: number;
};

const pct = (total: number, capacity: number) => (capacity > 0 ? Math.round((total / capacity) * 1000) / 10 : null);

export function buildServiceReport(event: ServiceEvent, counts: CountRow[], locations: CountLocation[], today: string): ServiceReport {
  const mine = new Map(counts.filter((c) => c.eventId === event.id).map((c) => [c.locationId, c.total]));
  const items = locations
    .filter((l) => l.siteId === event.siteId)
    .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, "es"))
    .map((l) => ({ locationId: l.id, name: l.name, capacity: l.capacity, total: mine.get(l.id) ?? null }));
  const counted = items.filter((i) => i.total !== null);
  const total = counted.reduce((s, i) => s + (i.total ?? 0), 0);
  const capacity = counted.reduce((s, i) => s + (i.capacity ?? 0), 0);
  return {
    event, items, total, capacity, occupancy: counted.length ? pct(total, capacity) : null, hasCounts: counted.length > 0,
    pending: event.status === "programado" && event.date <= today && counted.length === 0,
  };
}

/** Reporte de la semana de una sede: servicios agrupados por día, con totales por día y de la semana. */
export function buildSiteReport(siteId: string, siteName: string, events: ServiceEvent[], counts: CountRow[], locations: CountLocation[], today: string): SiteReport {
  const services = events
    .filter((e) => e.siteId === siteId)
    .map((e) => buildServiceReport(e, counts, locations, today))
    .sort((a, b) => a.event.date.localeCompare(b.event.date) || (a.event.shift > b.event.shift ? 1 : -1));
  const days: DayReport[] = [];
  for (const s of services) {
    let d = days.find((x) => x.date === s.event.date);
    if (!d) { d = { date: s.event.date, services: [], total: 0, capacity: 0, occupancy: null }; days.push(d); }
    d.services.push(s);
    d.total += s.total;
    d.capacity += s.capacity;
  }
  for (const d of days) d.occupancy = d.services.some((s) => s.hasCounts) ? pct(d.total, d.capacity) : null;
  const total = days.reduce((s, d) => s + d.total, 0);
  const capacity = days.reduce((s, d) => s + d.capacity, 0);
  return {
    siteId, siteName, days, total, capacity, occupancy: services.some((s) => s.hasCounts) ? pct(total, capacity) : null,
    services: services.filter((s) => s.event.status === "programado").length, counted: services.filter((s) => s.hasCounts).length, pending: services.filter((s) => s.pending).length,
  };
}

/** Total de la semana de una sede, para compararlo con la semana anterior. */
export const weekTotal = (siteId: string, events: ServiceEvent[], counts: CountRow[]): number => {
  const ids = new Set(events.filter((e) => e.siteId === siteId).map((e) => e.id));
  return counts.filter((c) => ids.has(c.eventId)).reduce((s, c) => s + c.total, 0);
};

// Textos de los avisos. Funciones puras. Nunca llevan nombres ni datos personales: solo avisan que hay algo que hacer.
import { serviceLabel } from "@/lib/labels";
import { formatServiceDateShort } from "@/lib/service/dates";

export type PushPayload = { title: string; body: string; url: string; tag?: string };

export function supportRequestPayload(requestId: string, r: { group_name: string; service_date: string; needed: number; filled: number; site_name: string }): PushPayload {
  const missing = Math.max(1, r.needed - r.filled);
  return {
    title: "Piden apoyo en tu sede",
    body: `${r.group_name} necesita ${missing} ${missing === 1 ? "persona" : "personas"} · ${formatServiceDateShort(r.service_date)}`,
    url: "/servicio",
    tag: `support-${requestId}`,
  };
}

export function pendingCountsPayload(r: { event_id: string; service_date: string; site_name: string; day: string; shift: string }): PushPayload {
  return {
    title: "Faltan los conteos del servicio",
    body: `${r.site_name} · ${serviceLabel(r.day, r.shift)} · ${formatServiceDateShort(r.service_date)}`,
    url: `/servicio/${r.event_id}`,
    tag: `counts-${r.event_id}`,
  };
}

export const testPayload = (): PushPayload => ({
  title: "Avisos activados",
  body: "Así se verán los avisos de LogiAI en este dispositivo.",
  url: "/perfil",
  tag: "test",
});

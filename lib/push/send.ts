import { appendFileSync } from "node:fs";
import webpush from "web-push";
import { vapidConfig } from "./config";
import type { PushPayload } from "./payloads";

export type PushSub = { id: string; endpoint: string; p256dh: string; auth: string };
/** Envía a un dispositivo. Devuelve `gone: true` si el dispositivo ya no existe (hay que olvidarlo) y lanza error si falló por otra causa. */
export type Sender = (sub: PushSub, payload: PushPayload) => Promise<{ gone?: boolean }>;

export const defaultSender: Sender = async (sub, payload) => {
  // Solo para las pruebas automáticas (nunca en producción): en vez de enviar, anota el aviso en un archivo.
  if (process.env.NODE_ENV !== "production" && process.env.PUSH_DRY_RUN_FILE) {
    appendFileSync(process.env.PUSH_DRY_RUN_FILE, JSON.stringify({ endpoint: sub.endpoint, payload }) + "\n");
    return {};
  }
  const v = vapidConfig();
  if (!v) throw new Error("Los avisos no están configurados");
  try {
    await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload), {
      TTL: 60 * 60 * 12, urgency: "normal", vapidDetails: { subject: v.subject, publicKey: v.publicKey, privateKey: v.privateKey },
    });
    return {};
  } catch (e) {
    const status = (e as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) return { gone: true };
    throw e;
  }
};

/** Envía el aviso a varios dispositivos; uno que falle no impide los demás. */
export async function sendAll(subs: PushSub[], payload: PushPayload, sender: Sender = defaultSender): Promise<{ sent: number; failed: number; goneIds: string[] }> {
  let sent = 0, failed = 0;
  const goneIds: string[] = [];
  await Promise.all(subs.map(async (s) => {
    try {
      const r = await sender(s, payload);
      if (r.gone) goneIds.push(s.id); else sent++;
    } catch { failed++; }
  }));
  return { sent, failed, goneIds };
}

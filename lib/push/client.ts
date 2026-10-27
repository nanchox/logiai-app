// Avisos al teléfono desde el navegador: activar o desactivar este dispositivo y las preferencias de cada persona.
import type { SupabaseClient } from "@supabase/supabase-js";
import { explain } from "@/lib/manual/mutations";

export const pushSupported = () => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
export const isIos = () => typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);
export const isStandalone = () => typeof window !== "undefined" && (window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);

function keyToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export async function thisDevice(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

/** Pide permiso, suscribe este dispositivo y lo registra en la cuenta. */
export async function enablePush(sb: SupabaseClient, vapidPublicKey: string): Promise<void> {
  if (!pushSupported()) throw new Error("Este navegador no admite avisos.");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("No diste permiso para los avisos. Si los bloqueaste, actívalos en la configuración del sitio de tu navegador.");
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(vapidPublicKey) }));
  const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) throw new Error("No se pudo activar los avisos en este dispositivo.");
  const { error } = await sb.rpc("save_push_subscription", { p_endpoint: json.endpoint, p_p256dh: json.keys.p256dh, p_auth: json.keys.auth });
  if (error) throw explain(error, "No se pudo activar los avisos.");
}

export async function disablePush(sb: SupabaseClient): Promise<void> {
  const sub = await thisDevice();
  if (!sub) return;
  await sb.rpc("remove_push_subscription", { p_endpoint: sub.endpoint });
  await sub.unsubscribe().catch(() => undefined);
}

export type Prefs = { supportRequests: boolean; pendingCounts: boolean };
export async function loadPrefs(sb: SupabaseClient, userId: string): Promise<Prefs> {
  const { data } = await sb.from("notification_prefs").select("support_requests, pending_counts").eq("user_id", userId).maybeSingle();
  return { supportRequests: data?.support_requests ?? true, pendingCounts: data?.pending_counts ?? true };
}
export async function savePrefs(sb: SupabaseClient, userId: string, p: Prefs): Promise<void> {
  const { error } = await sb.from("notification_prefs").upsert({ user_id: userId, support_requests: p.supportRequests, pending_counts: p.pendingCounts }, { onConflict: "user_id" });
  if (error) throw explain(error);
}

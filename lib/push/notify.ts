// Quién recibe cada aviso y envío. La lista de a quién avisar la calcula la base de datos (funciones solo del servidor) y cada aviso se
// registra para no repetirlo.
import type { SupabaseClient } from "@supabase/supabase-js";
import { pendingCountsPayload, supportRequestPayload, type PushPayload } from "./payloads";
import { sendAll, type PushSub, type Sender, defaultSender } from "./send";

type Summary = { audience: number; sent: number; failed: number };

async function deliver(admin: SupabaseClient, userIds: string[], payloadFor: (userId: string) => PushPayload | null, sender: Sender): Promise<Pick<Summary, "sent" | "failed">> {
  if (!userIds.length) return { sent: 0, failed: 0 };
  const { data } = await admin.from("push_subscriptions").select("id, user_id, endpoint, p256dh, auth").in("user_id", userIds);
  let sent = 0, failed = 0;
  const gone: string[] = [];
  for (const userId of userIds) {
    const payload = payloadFor(userId);
    const subs = ((data ?? []) as (PushSub & { user_id: string })[]).filter((s) => s.user_id === userId);
    if (!payload || !subs.length) continue;
    const r = await sendAll(subs, payload, sender);
    sent += r.sent; failed += r.failed; gone.push(...r.goneIds);
  }
  if (gone.length) await admin.from("push_subscriptions").delete().in("id", gone);   // dispositivos que ya no existen
  return { sent, failed };
}

const claim = async (admin: SupabaseClient, user: string, kind: string, ref: string, daily: boolean) =>
  ((await admin.rpc("claim_notification", { p_user: user, p_kind: kind, p_ref: ref, p_daily: daily })).data as boolean | null) === true;

/** Avisa a quienes pueden atender una solicitud de apoyo recién publicada. */
export async function notifySupportRequest(admin: SupabaseClient, requestId: string, sender: Sender = defaultSender): Promise<Summary> {
  const { data } = await admin.rpc("support_request_audience", { p_request: requestId });
  const rows = (data ?? []) as { user_id: string; group_name: string; service_date: string; needed: number; filled: number; site_name: string }[];
  const users: string[] = [];
  for (const r of rows) if (!users.includes(r.user_id) && (await claim(admin, r.user_id, "support_request", requestId, false))) users.push(r.user_id);
  if (!rows.length) return { audience: 0, sent: 0, failed: 0 };
  const payload = supportRequestPayload(requestId, rows[0]);
  return { audience: users.length, ...(await deliver(admin, users, () => payload, sender)) };
}

/** Recuerda a coordinadores y supervisores los conteos que faltan (a lo sumo un aviso por persona y servicio al día). */
export async function notifyPendingCounts(admin: SupabaseClient, sender: Sender = defaultSender): Promise<Summary> {
  const { data } = await admin.rpc("pending_counts_audience");
  const rows = (data ?? []) as { user_id: string; event_id: string; service_date: string; site_name: string; day: string; shift: string }[];
  const byUser = new Map<string, typeof rows>();
  for (const r of rows) {
    if (await claim(admin, r.user_id, "pending_counts", r.event_id, true)) byUser.set(r.user_id, [...(byUser.get(r.user_id) ?? []), r]);
  }
  let sent = 0, failed = 0;
  for (const [userId, events] of byUser) {
    // Un aviso por servicio pendiente.
    for (const e of events) {
      const r = await deliver(admin, [userId], () => pendingCountsPayload(e), sender);
      sent += r.sent; failed += r.failed;
    }
  }
  return { audience: byUser.size, sent, failed };
}

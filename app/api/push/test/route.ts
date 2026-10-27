import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { pushConfigured } from "@/lib/push/config";
import { testPayload } from "@/lib/push/payloads";
import { sendAll, type PushSub } from "@/lib/push/send";
import { createClient } from "@/lib/supabase/server";

/** Envía un aviso de prueba a los dispositivos de quien llama (sus propios dispositivos, con su sesión). */
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Inicia sesión para continuar." }, { status: 401 });
  if (!pushConfigured()) return NextResponse.json({ error: "Los avisos todavía no están configurados." }, { status: 503 });

  const supabase = await createClient();
  const { data } = await supabase.from("push_subscriptions").select("id, endpoint, p256dh, auth");
  const subs = (data ?? []) as PushSub[];
  if (!subs.length) return NextResponse.json({ error: "Este dispositivo todavía no tiene los avisos activados." }, { status: 409 });
  const r = await sendAll(subs, testPayload());
  if (r.goneIds.length) await supabase.from("push_subscriptions").delete().in("id", r.goneIds);
  return NextResponse.json({ sent: r.sent, devices: subs.length });
}

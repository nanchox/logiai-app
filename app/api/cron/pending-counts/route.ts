import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { pushConfigured } from "@/lib/push/config";
import { notifyPendingCounts } from "@/lib/push/notify";
import { createAdminClient } from "@/lib/supabase/admin";

const digest = (s: string) => createHash("sha256").update(s).digest();

/** Tarea programada (Vercel Cron): recuerda los conteos pendientes. Solo la ejecuta quien conozca CRON_SECRET (Vercel lo envía solo). */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return NextResponse.json({ error: "CRON_SECRET no está configurado" }, { status: 503 });
  const sent = req.headers.get("authorization") ?? "";
  if (!timingSafeEqual(digest(sent), digest(`Bearer ${secret}`))) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const admin = createAdminClient();
  if (!admin || !pushConfigured()) return NextResponse.json({ skipped: "Los avisos no están configurados" });
  return NextResponse.json(await notifyPendingCounts(admin));
}

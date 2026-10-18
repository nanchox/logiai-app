// Operaciones de anuncios. Se ejecutan con la sesión del usuario: los permisos los decide la base de datos.
import type { SupabaseClient } from "@supabase/supabase-js";
import { explain } from "@/lib/manual/mutations";
import type { Category, Scope } from "./types";

type PgError = { code?: string; message: string } | null;
const must = <T>(r: { data: T; error: PgError }): T => {
  if (r.error) throw explain(r.error);
  return r.data;
};

export const MAX_LINKS = 5;
const HTTPS = /^https:\/\/\S+$/i;

export type AnnouncementInput = {
  title: string;
  body: string;
  category: Category;
  scope: Scope;
  pinned: boolean;
  startsAt: string | null;   // ISO; null = ahora
  endsAt: string | null;     // ISO; null = sin fin
  links: { label: string; url: string }[];
};

function validate(i: AnnouncementInput) {
  if (!i.title.trim()) throw new Error("Escribe un título.");
  if (i.title.trim().length > 140) throw new Error("El título es demasiado largo (máximo 140 caracteres).");
  if (i.body.length > 5000) throw new Error("El mensaje es demasiado largo (máximo 5000 caracteres).");
  if (i.endsAt && new Date(i.endsAt).getTime() <= new Date(i.startsAt ?? Date.now()).getTime()) throw new Error("«Vigente hasta» debe ser posterior a cuándo se publica.");
  if (i.links.length > MAX_LINKS) throw new Error(`Máximo ${MAX_LINKS} enlaces.`);
  for (const l of i.links) {
    if (!l.label.trim()) throw new Error("Cada enlace necesita un texto (por ejemplo, «Programa del culto»).");
    if (!HTTPS.test(l.url.trim())) throw new Error(`El enlace «${l.label.trim()}» debe empezar con https://`);
  }
  const s = i.scope;
  if ((s.kind === "site" || s.kind === "site_day") && !s.siteId) throw new Error("Elige la sede.");
  if ((s.kind === "site_day" || s.kind === "day") && !s.day) throw new Error("Elige el día.");
  if (s.kind === "group" && !s.groupId) throw new Error("Elige el grupo.");
}

/** Crea o actualiza una novedad con sus enlaces. Devuelve su id. */
export async function saveAnnouncement(sb: SupabaseClient, input: AnnouncementInput, id?: string): Promise<string> {
  validate(input);
  const { scope: s } = input;
  const startsAt = input.startsAt ?? (id ? new Date().toISOString() : undefined);
  const row = {
    title: input.title.trim(),
    body: input.body.trim(),
    category: input.category,
    site_id: s.kind === "site" || s.kind === "site_day" ? s.siteId : null,
    day: s.kind === "site_day" || s.kind === "day" ? s.day : null,
    group_id: s.kind === "group" ? s.groupId : null,
    pinned: input.pinned,
    // Sin fecha: al crear se publica ahora (valor por defecto); al editar, dejar el campo vacío significa «publicar ahora».
    ...(startsAt ? { starts_at: startsAt } : {}),
    ends_at: input.endsAt,
  };

  let announcementId = id;
  if (id) {
    const upd = must(await sb.from("announcements").update(row).eq("id", id).select("id")) as unknown[];
    if (!upd.length) throw new Error("No tienes permiso para editar esta novedad.");
    must(await sb.from("announcement_links").delete().eq("announcement_id", id));
  } else {
    announcementId = (must(await sb.from("announcements").insert(row).select("id").single()) as { id: string }).id;
  }

  if (input.links.length) {
    must(await sb.from("announcement_links").insert(
      input.links.map((l, i) => ({ announcement_id: announcementId, label: l.label.trim(), url: l.url.trim(), sort: i })),
    ));
  }
  return announcementId!;
}

export async function deleteAnnouncement(sb: SupabaseClient, id: string) {
  must(await sb.from("announcements").delete().eq("id", id));
}

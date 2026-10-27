// Operaciones de anuncios. Se ejecutan con la sesión del usuario: los permisos los decide la base de datos.
import type { SupabaseClient } from "@supabase/supabase-js";
import { explain } from "@/lib/manual/mutations";
import { prepareAnnouncementImage } from "@/lib/image";
import type { AnnouncementImage, Category, Scope } from "./types";

type PgError = { code?: string; message: string } | null;
const must = <T>(r: { data: T; error: PgError }): T => {
  if (r.error) throw explain(r.error);
  return r.data;
};

export const MAX_LINKS = 5;
export const MAX_IMAGES = 4;
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
  keepImages: AnnouncementImage[];   // las que ya tenía y se conservan
  newImages: File[];                 // las que se agregan (se reducen a máximo 1 MB)
};

function validate(i: AnnouncementInput) {
  if (!i.title.trim()) throw new Error("Escribe un título.");
  if (i.title.trim().length > 140) throw new Error("El título es demasiado largo (máximo 140 caracteres).");
  if (i.body.length > 5000) throw new Error("El mensaje es demasiado largo (máximo 5000 caracteres).");
  if (i.endsAt && new Date(i.endsAt).getTime() <= new Date(i.startsAt ?? Date.now()).getTime()) throw new Error("«Vigente hasta» debe ser posterior a cuándo se publica.");
  if (i.keepImages.length + i.newImages.length > MAX_IMAGES) throw new Error(`Máximo ${MAX_IMAGES} imágenes.`);
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
  await syncImages(sb, announcementId!, input, id);
  return announcementId!;
}

/** Quita las imágenes descartadas y sube las nuevas. Si una subida falla, la novedad ya quedó guardada y se avisa. */
async function syncImages(sb: SupabaseClient, announcementId: string, input: AnnouncementInput, existed?: string) {
  if (existed) {
    const current = must(await sb.from("announcement_images").select("id, image_path").eq("announcement_id", announcementId)) as { id: string; image_path: string }[];
    const keep = new Set(input.keepImages.map((i) => i.id));
    const drop = current.filter((c) => !keep.has(c.id));
    if (drop.length) {
      must(await sb.from("announcement_images").delete().in("id", drop.map((d) => d.id)));
      await sb.storage.from("announcements").remove(drop.map((d) => d.image_path));
    }
  }
  let sort = input.keepImages.length;
  for (const file of input.newImages) {
    try {
      const img = await prepareAnnouncementImage(file);
      const path = `${announcementId}/${crypto.randomUUID()}.${img.ext}`;
      const up = await sb.storage.from("announcements").upload(path, img.bytes, { contentType: img.contentType });
      if (up.error) throw explain(up.error, "No se pudo subir la imagen.");
      const { error } = await sb.from("announcement_images").insert({ announcement_id: announcementId, image_path: path, sort: sort++ });
      if (error) {
        await sb.storage.from("announcements").remove([path]);
        throw explain(error);
      }
    } catch (e) {
      throw new Error(`La novedad se guardó, pero una imagen falló: ${(e as Error).message}`);
    }
  }
}

export async function deleteAnnouncement(sb: SupabaseClient, id: string) {
  const imgs = (await sb.from("announcement_images").select("image_path").eq("announcement_id", id)).data as { image_path: string }[] | null;
  // Primero los archivos (la política de Storage mira que la novedad exista); si no se tiene permiso, no se borra nada.
  if (imgs?.length) await sb.storage.from("announcements").remove(imgs.map((i) => i.image_path));
  must(await sb.from("announcements").delete().eq("id", id));
}

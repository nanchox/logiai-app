import { DAY_LABEL, SHIFT_LABEL } from "@/lib/labels";
import type { Viewer } from "@/lib/people/types";

export type Category = "anuncio" | "cambio" | "noticia";
export const CATEGORIES: Category[] = ["anuncio", "cambio", "noticia"];
export const CATEGORY_LABEL: Record<Category, string> = { anuncio: "Anuncio", cambio: "Cambio", noticia: "Noticia" };
export const CATEGORY_PLURAL: Record<Category, string> = { anuncio: "Anuncios", cambio: "Cambios", noticia: "Noticias" };

export type ScopeKind = "all" | "site" | "site_day" | "day" | "group";
export type Scope = { kind: ScopeKind; siteId: string | null; day: string | null; groupId: string | null };
export type Status = "active" | "scheduled" | "expired";

export type AnnouncementLink = { id: string; label: string; url: string };
export type AnnouncementItem = {
  id: string;
  title: string;
  body: string;
  category: Category;
  siteId: string | null;
  siteName: string | null;
  day: string | null;
  groupId: string | null;
  groupName: string | null;
  groupWhen: string | null;     // «Sábado PM» del grupo
  pinned: boolean;
  startsAt: string;
  endsAt: string | null;
  createdAt: string;
  authorName: string | null;
  authorRole: string | null;
  links: AnnouncementLink[];
  status: Status;
};

export const scopeKindOf = (a: Pick<AnnouncementItem, "siteId" | "day" | "groupId">): ScopeKind =>
  a.groupId ? "group" : a.siteId && a.day ? "site_day" : a.siteId ? "site" : a.day ? "day" : "all";

/** Etiqueta corta de a quién va dirigido: «Toda la iglesia», «Castellana · Sábado», «Grupo 1 · Sábado PM · Castellana»… */
export function scopeLabel(a: Pick<AnnouncementItem, "siteId" | "siteName" | "day" | "groupId" | "groupName" | "groupWhen">): string {
  switch (scopeKindOf(a)) {
    case "group": return [a.groupName, a.groupWhen, a.siteName].filter(Boolean).join(" · ");
    case "site_day": return `${a.siteName ?? "Sede"} · ${DAY_LABEL[a.day!] ?? a.day}`;
    case "site": return a.siteName ?? "Sede";
    case "day": return `Todas las sedes · ${DAY_LABEL[a.day!] ?? a.day}`;
    default: return "Toda la iglesia";
  }
}

/** ¿Puede el usuario editar o eliminar este anuncio? (refleja las políticas de la base de datos, que son las que mandan) */
export function canManageAnnouncement(v: Viewer | null, a: Pick<AnnouncementItem, "siteId" | "groupId">): boolean {
  if (!v) return false;
  if (v.kind === "admin" || v.kind === "head") return true;
  if (v.kind === "leader") return !!a.siteId && v.siteIds.includes(a.siteId);
  return !!a.groupId && a.groupId === v.groupId;
}

export const slotWhen = (day: string, shift: string) => [DAY_LABEL[day] ?? day, SHIFT_LABEL[shift] ?? ""].filter(Boolean).join(" ");

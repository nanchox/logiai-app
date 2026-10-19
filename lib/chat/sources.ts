import type { Fragment } from "./prompt";

export type SearchRow = { kind: Fragment["kind"]; id: string; site_slug: string | null; location_id: string | null; title: string; body: string };

/** Enlace de la fuente: lo arma el servidor con los identificadores de la base de datos, nunca el modelo. */
export function hrefFor(r: Pick<SearchRow, "kind" | "site_slug" | "location_id">): string {
  if (r.kind === "posicion" && r.site_slug && r.location_id) return `/manual/${r.site_slug}/${r.location_id}`;
  if (r.kind === "flujo" && r.site_slug) return `/manual/${r.site_slug}/flujos`;
  return "/novedades";
}

export const toFragments = (rows: SearchRow[]): Fragment[] => rows.map((r) => ({ kind: r.kind, title: r.title, body: r.body, href: hrefFor(r) }));

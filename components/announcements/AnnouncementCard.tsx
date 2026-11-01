import { formatDateTime } from "@/lib/announcements/dates";
import { CATEGORY_LABEL, scopeLabel, type AnnouncementItem, type Category } from "@/lib/announcements/types";
import { ExternalLink } from "./ExternalLink";
import { ImageGallery } from "./ImageGallery";
import { LinkedText } from "./LinkedText";

const CATEGORY_STYLE: Record<Category, string> = {
  anuncio: "bg-accent text-on-accent",
  cambio: "bg-danger text-white",
  noticia: "bg-primary text-on-primary",
};

export function CategoryBadge({ category }: { category: Category }) {
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${CATEGORY_STYLE[category]}`}>{CATEGORY_LABEL[category]}</span>;
}

/** Tarjeta de una novedad. `actions` se muestra solo a quien puede editarlo. */
export function AnnouncementCard({ a, actions, compact }: { a: AnnouncementItem; actions?: React.ReactNode; compact?: boolean }) {
  const by = [a.authorName, a.authorRole].filter(Boolean).join(" · ");
  return (
    <article aria-label={a.title} className={`rounded-2xl border bg-surface p-5 ${a.pinned ? "border-accent" : "border-line"} ${a.status !== "active" ? "opacity-80" : ""}`}>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {a.pinned && <span className="font-bold">📌 Fijado</span>}
        <CategoryBadge category={a.category} />
        <span className="rounded-full border border-line px-2.5 py-0.5 font-semibold">{scopeLabel(a)}</span>
        {a.status === "scheduled" && <span className="rounded-full border border-info px-2.5 py-0.5 font-bold">Programado · se publica {formatDateTime(a.startsAt)}</span>}
        {a.status === "expired" && a.endsAt && <span className="rounded-full border border-danger px-2.5 py-0.5 font-bold text-danger">Vencido · terminó {formatDateTime(a.endsAt)}</span>}
      </div>

      <h2 className={`mt-2 font-extrabold text-link ${compact ? "text-base" : "text-xl"}`}>{a.title}</h2>
      {a.body && !compact && <LinkedText text={a.body} className="mt-2" />}

      {!compact && <ImageGallery images={a.images} title={a.title} />}

      {a.links.length > 0 && !compact && (
        <ul className="mt-3 flex flex-wrap gap-2" aria-label="Enlaces">
          {a.links.map((l) => (
            <li key={l.id}>
              <ExternalLink href={l.url} className="inline-flex items-center gap-1 rounded-lg border border-line bg-bg px-3 py-2 text-sm font-semibold no-underline hover:border-primary">
                {l.label} <span aria-hidden>↗</span>
              </ExternalLink>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-3 text-xs text-muted">
        {a.status === "scheduled" ? "Programado" : "Publicado"} {formatDateTime(a.startsAt)}{by && ` · ${by}`}
      </p>
      {actions && <div className="mt-3 flex flex-wrap gap-2">{actions}</div>}
    </article>
  );
}

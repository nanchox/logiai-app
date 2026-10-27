import { splitLinks } from "@/lib/announcements/linkify";
import { ExternalLink } from "./ExternalLink";

/** Texto con los enlaces (http/https) convertidos en enlaces. El resto se muestra tal cual: React escapa cualquier HTML. */
export function LinkedText({ text, className }: { text: string; className?: string }) {
  return (
    <p className={`whitespace-pre-line break-words leading-relaxed ${className ?? ""}`}>
      {splitLinks(text).map((p, i) =>
        p.type === "link" ? (
          <ExternalLink key={i} href={p.value} className="break-all">{p.value}</ExternalLink>
        ) : (
          <span key={i}>{p.value}</span>
        ),
      )}
    </p>
  );
}

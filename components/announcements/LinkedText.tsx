import { splitLinks } from "@/lib/announcements/linkify";

/** Texto con los enlaces (http/https) convertidos en enlaces. El resto se muestra tal cual: React escapa cualquier HTML. */
export function LinkedText({ text, className }: { text: string; className?: string }) {
  return (
    <p className={`whitespace-pre-line break-words leading-relaxed ${className ?? ""}`}>
      {splitLinks(text).map((p, i) =>
        p.type === "link" ? (
          <a key={i} href={p.value} target="_blank" rel="noopener noreferrer" className="break-all">{p.value}</a>
        ) : (
          <span key={i}>{p.value}</span>
        ),
      )}
    </p>
  );
}

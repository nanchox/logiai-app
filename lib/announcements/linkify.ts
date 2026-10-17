export type Piece = { type: "text" | "link"; value: string };

const URL_RE = /https?:\/\/[^\s<>"']+/g;
const TRAILING = /[.,;:!?)\]}»”]+$/;

/** Parte un texto en trozos de texto y enlaces (http/https). La puntuación final no se incluye en el enlace. */
export function splitLinks(text: string): Piece[] {
  const out: Piece[] = [];
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    const start = m.index ?? 0;
    let url = m[0];
    const trailing = url.match(TRAILING)?.[0] ?? "";
    url = url.slice(0, url.length - trailing.length);
    if (start > last) out.push({ type: "text", value: text.slice(last, start) });
    try {
      new URL(url);
      out.push({ type: "link", value: url });
    } catch {
      out.push({ type: "text", value: url });
    }
    last = start + url.length;
  }
  if (last < text.length) out.push({ type: "text", value: text.slice(last) });
  return out;
}

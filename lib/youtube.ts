// Solo se incrustan videos de YouTube, y siempre a partir del ID de 11 caracteres (nunca la URL tal cual).
const ID = /^[A-Za-z0-9_-]{11}$/;
const HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be"]);

export function parseYouTubeId(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || !HOSTS.has(url.hostname)) return null;

  let id: string | null = null;
  if (url.hostname === "youtu.be") {
    id = url.pathname.split("/")[1] ?? null;
  } else if (url.pathname === "/watch") {
    id = url.searchParams.get("v");
  } else {
    const [, kind, maybeId] = url.pathname.split("/");
    if (["shorts", "embed", "live", "v"].includes(kind)) id = maybeId ?? null;
  }
  return id && ID.test(id) ? id : null;
}

export const youtubeEmbedUrl = (id: string) => `https://www.youtube-nocookie.com/embed/${id}?rel=0&autoplay=1`;
export const youtubeThumbUrl = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

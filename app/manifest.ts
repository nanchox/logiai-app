import type { MetadataRoute } from "next";

/** Manifiesto de la PWA: permite instalar LogiAI en la pantalla de inicio y abrirla como una aplicación. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "LogiAI · Asistente de Logística de la Iglesia",
    short_name: "LogiAI",
    description: "Manual de logística, tu servicio, novedades y un asistente para el equipo.",
    lang: "es",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0b0713",
    theme_color: "#0b0713",
    categories: ["productivity", "lifestyle"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Mi servicio", short_name: "Servicio", url: "/servicio", icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }] },
      { name: "Manual", short_name: "Manual", url: "/manual", icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }] },
      { name: "Asistente", short_name: "Asistente", url: "/asistente", icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }] },
    ],
  };
}

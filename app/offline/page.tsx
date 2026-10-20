import type { Metadata } from "next";

export const metadata: Metadata = { title: "Sin conexión" };

/**
 * La muestra el service worker cuando no hay internet. Es pública, estática y AUTOSUFICIENTE: sin conexión no hay forma de cargar
 * los estilos ni el JavaScript de la aplicación, así que usa estilos en línea y un enlace normal para reintentar.
 */
export default function OfflinePage() {
  return (
    <>
    <style>{"body{margin:0;background:#0b0713}"}</style>
    <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: "1rem", background: "#0b0713", color: "#f7f3ff", fontFamily: "system-ui, sans-serif" }}>
      <section style={{ width: "100%", maxWidth: "24rem", textAlign: "center", padding: "2rem", borderRadius: "1rem", background: "#130e1f", border: "1px solid #2e2347" }}>
        <p style={{ margin: 0, fontSize: ".8rem", fontWeight: 700, letterSpacing: ".2em", color: "#ffd700" }}>LOGIAI</p>
        <h1 style={{ margin: ".5rem 0 0", fontSize: "1.6rem" }}>Sin conexión</h1>
        <p style={{ margin: ".75rem 0 1.5rem", color: "#b5a8cc", lineHeight: 1.5 }}>
          No hay internet en este momento. Revisa tu conexión y vuelve a intentar: tu información se carga siempre desde la red para que esté al día.
        </p>
        {/* href vacío = esta misma dirección */}
        <a href="" style={{ display: "inline-block", padding: ".6rem 1.2rem", borderRadius: ".5rem", background: "#8b3dff", color: "#fff", fontWeight: 700, textDecoration: "none" }}>Reintentar</a>
      </section>
    </main>
    </>
  );
}

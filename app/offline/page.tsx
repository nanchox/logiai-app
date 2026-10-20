import type { Metadata } from "next";
import { RetryButton } from "./RetryButton";

export const metadata: Metadata = { title: "Sin conexión" };

/** La muestra el service worker cuando no hay internet. Es pública y estática. */
export default function OfflinePage() {
  return (
    <main className="grid min-h-dvh place-items-center bg-surface px-4">
      <section className="w-full max-w-sm rounded-2xl border border-line bg-bg p-8 text-center shadow-lg">
        <p className="text-sm font-bold tracking-[0.2em] text-link">LOGIAI</p>
        <h1 className="mt-2 text-2xl font-extrabold">Sin conexión</h1>
        <p className="mb-6 mt-2 text-muted">No hay internet en este momento. Revisa tu conexión y vuelve a intentar: tu información se carga siempre desde la red para que esté al día.</p>
        <RetryButton />
      </section>
    </main>
  );
}

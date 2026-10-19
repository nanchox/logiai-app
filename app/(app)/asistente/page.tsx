import type { Metadata } from "next";
import { ChatClient } from "@/components/chat/ChatClient";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Asistente" };

export default async function AssistantPage() {
  await requireUser();
  return (
    <main className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold">Asistente</h1>
        <p className="mt-1 text-muted">Resuelve dudas de tu servicio con lo que está cargado: el manual de tu sede, los flujos y las novedades. No lee los archivos de programación ni usa tu correo.</p>
      </div>
      <ChatClient configured={!!process.env.OPENROUTER_API_KEY} limit={Number(process.env.CHAT_DAILY_LIMIT) || 30} />
    </main>
  );
}

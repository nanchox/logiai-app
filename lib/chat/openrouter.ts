// Cliente mínimo de OpenRouter (sin herramientas ni streaming: los modelos gratuitos que rotan no los soportan de forma fiable).
export type ModelMessage = { role: "system" | "user" | "assistant"; content: string };

export class ChatUnavailableError extends Error {}

type Fetch = typeof fetch;
export type AskOptions = { baseUrl?: string; apiKey: string; models: string[]; messages: ModelMessage[]; fetchFn?: Fetch; timeoutMs?: number; referer?: string };

/** Lista de modelos de la variable OPENROUTER_MODEL (separados por coma: se prueban en orden si uno falla o está saturado). */
export const parseModels = (v: string | undefined): string[] => (v?.trim() || "openrouter/free").split(",").map((m) => m.trim()).filter(Boolean);

export async function askModel(o: AskOptions): Promise<{ text: string; model: string }> {
  const doFetch = o.fetchFn ?? fetch;
  let lastError = "sin respuesta";
  for (const model of o.models) {
    try {
      const res = await doFetch(`${(o.baseUrl ?? "https://openrouter.ai/api/v1").replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${o.apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": o.referer ?? "https://logiai.app",
          "X-Title": "LogiAI",
        },
        body: JSON.stringify({ model, messages: o.messages, temperature: 0.2, max_tokens: 600 }),
        signal: AbortSignal.timeout(o.timeoutMs ?? 30_000),
      });
      if (res.status === 401 || res.status === 403) throw new ChatUnavailableError("La clave de OpenRouter no es válida.");
      if (!res.ok) { lastError = `HTTP ${res.status}`; continue; }
      const json = (await res.json()) as { choices?: { message?: { content?: unknown } }[]; error?: { message?: string } };
      const text = json.choices?.[0]?.message?.content;
      if (typeof text === "string" && text.trim()) return { text: text.trim(), model };
      lastError = json.error?.message ?? "respuesta vacía";
    } catch (e) {
      if (e instanceof ChatUnavailableError) throw e;
      lastError = (e as Error).name === "TimeoutError" ? "tiempo agotado" : (e as Error).message;
    }
  }
  throw new ChatUnavailableError(`El modelo no respondió (${lastError}).`);
}

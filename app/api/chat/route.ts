import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { personContext } from "@/lib/chat/context";
import { askModel, ChatUnavailableError, parseModels } from "@/lib/chat/openrouter";
import { buildMessages, cleanHistory, cleanQuestion, MAX_QUESTION } from "@/lib/chat/prompt";
import { type SearchRow, toFragments } from "@/lib/chat/sources";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;

const fail = (status: number, error: string) => NextResponse.json({ error }, { status });

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return fail(401, "Inicia sesión para usar el asistente.");

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return fail(503, "El asistente todavía no está configurado.");

  const body = (await req.json().catch(() => null)) as { question?: unknown; history?: unknown } | null;
  const question = cleanQuestion(body?.question);
  if (!question) return fail(400, `Escribe una pregunta de hasta ${MAX_QUESTION} caracteres.`);
  const history = cleanHistory(body?.history);

  // Todo corre con la sesión de la persona: la búsqueda solo ve lo que sus permisos (RLS) permiten.
  const supabase = await createClient();
  const limit = Number(process.env.CHAT_DAILY_LIMIT) || 30;
  const usage = await supabase.rpc("chat_consume", { p_limit: limit });
  if (usage.error) return fail(500, "No se pudo registrar la pregunta. Intenta de nuevo.");
  const { allowed, used } = usage.data as { allowed: boolean; used: number };
  if (!allowed) return fail(429, `Llegaste al límite de ${limit} preguntas de hoy. Vuelve mañana.`);

  // Una pregunta corta («¿y el sábado?») se busca junto con la anterior para no perder el tema.
  const previous = [...history].reverse().find((t) => t.role === "user")?.content ?? "";
  const searchText = question.split(/\s+/).length <= 4 ? `${previous} ${question}` : question;
  const [found, context] = await Promise.all([
    supabase.rpc("search_manual", { p_query: searchText, p_limit: 6 }),
    personContext(supabase, user),
  ]);
  const fragments = toFragments((found.data ?? []) as SearchRow[]);

  try {
    const { text } = await askModel({
      apiKey,
      baseUrl: process.env.OPENROUTER_BASE_URL,
      models: parseModels(process.env.OPENROUTER_MODEL),
      messages: buildMessages({ question, history, context, fragments }),
      referer: new URL(req.url).origin,
    });
    return NextResponse.json({
      answer: text,
      sources: fragments.map((f, i) => ({ n: i + 1, title: f.title, href: f.href })),
      remaining: Math.max(0, limit - used),
    });
  } catch (e) {
    const message = e instanceof ChatUnavailableError ? e.message : "El asistente no pudo responder.";
    return fail(502, `${message} Intenta de nuevo en un momento.`);
  }
}

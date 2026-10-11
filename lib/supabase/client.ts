import { createBrowserClient } from "@supabase/ssr";

type PublicSupabaseConfig = { url: string; key: string };

declare global {
  interface Window {
    __LOGIAI_SUPABASE__?: PublicSupabaseConfig;
  }
}

function readEnv(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function getPublicConfig(): PublicSupabaseConfig {
  const runtime = typeof window !== "undefined" ? window.__LOGIAI_SUPABASE__ : undefined;
  const url = readEnv(runtime?.url) ?? readEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key =
    readEnv(runtime?.key) ??
    readEnv(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) ??
    readEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  if (!url) throw new Error("Missing required environment variable: NEXT_PUBLIC_SUPABASE_URL");
  if (!key) {
    throw new Error(
      "Missing required environment variable: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  }
  return { url, key };
}

export const createClient = () => {
  const { url, key } = getPublicConfig();
  return createBrowserClient(url, key);
};

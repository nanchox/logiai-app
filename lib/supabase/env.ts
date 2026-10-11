function readEnv(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

const supabaseUrlFromEnv = readEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
const supabasePublishableKeyFromEnv = readEnv(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
const supabaseAnonKeyFromEnv = readEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

if (!supabaseUrlFromEnv) {
  throw new Error("Missing required environment variable: NEXT_PUBLIC_SUPABASE_URL");
}

const supabaseKeyFromEnv = supabasePublishableKeyFromEnv ?? supabaseAnonKeyFromEnv;
if (!supabaseKeyFromEnv) {
  throw new Error(
    "Missing required environment variable: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY",
  );
}

// Acepta la clave "publishable" (nueva) o la "anon" (legada) de Supabase.
export const supabaseUrl = supabaseUrlFromEnv;
export const supabaseKey = supabaseKeyFromEnv;

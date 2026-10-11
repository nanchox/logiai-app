function readEnv(name: string): string | undefined {
  const value = process.env[name];
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function requiredEnv(name: string): string {
  const value = readEnv(name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

// Acepta la clave "publishable" (nueva) o la "anon" (legada) de Supabase.
export const supabaseUrl = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
export const supabaseKey =
  readEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") ?? requiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");

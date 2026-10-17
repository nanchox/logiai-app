// IMPORTANTE: Next.js solo incrusta las variables NEXT_PUBLIC_* en el código del navegador cuando se
// escriben de forma LITERAL (process.env.NEXT_PUBLIC_X). Un acceso dinámico, como process.env[nombre],
// llega vacío al navegador aunque la variable exista en Vercel. Por eso cada variable se nombra aquí tal cual.
const clean = (value: string | undefined) => value?.trim() || undefined;

/** URL y clave pública de Supabase. Se valida al usarla (no al importar) y el error dice qué falta. */
export function getSupabaseConfig(): { url: string; key: string } {
  const url = clean(process.env.NEXT_PUBLIC_SUPABASE_URL);
  // Acepta la clave "publishable" (nueva) o la "anon" (legada) de Supabase.
  const key = clean(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) ?? clean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  if (!url) throw new Error(missing("NEXT_PUBLIC_SUPABASE_URL"));
  if (!key) throw new Error(missing("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (o NEXT_PUBLIC_SUPABASE_ANON_KEY)"));
  return { url, key };
}

const missing = (name: string) =>
  `Falta la variable de entorno ${name}. Agrégala en Vercel (Settings → Environment Variables) y vuelve a desplegar: ` +
  `las variables NEXT_PUBLIC_* se incrustan al compilar.`;

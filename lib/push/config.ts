// Configuración de los avisos al teléfono (Web Push). Se activan solo si están las tres variables; si falta alguna, la aplicación
// funciona igual y no ofrece los avisos.
const clean = (v: string | undefined) => v?.trim() || undefined;

export function vapidConfig() {
  const publicKey = clean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY);
  const privateKey = clean(process.env.VAPID_PRIVATE_KEY);
  const subject = clean(process.env.VAPID_SUBJECT) ?? (clean(process.env.LEGAL_EMAIL) ? `mailto:${clean(process.env.LEGAL_EMAIL)}` : undefined);
  return publicKey && privateKey && subject ? { publicKey, privateKey, subject } : null;
}

export const pushConfigured = () => vapidConfig() !== null;

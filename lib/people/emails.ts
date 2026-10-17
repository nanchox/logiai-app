const EMAIL_IN_TEXT = /[^\s<>,;"'()]*@[^\s<>,;"'()]+/g;
const VALID = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const MAX_EMAILS = 200;

/** Extrae correos de un texto pegado (comas, saltos de línea, "Nombre <correo>"…): en minúsculas y sin repetidos. */
export function parseEmails(text: string): { valid: string[]; invalid: string[] } {
  const found = [...new Set((text.match(EMAIL_IN_TEXT) ?? []).map((e) => e.trim().toLowerCase().replace(/[.]+$/, "")))];
  return { valid: found.filter((e) => VALID.test(e)), invalid: found.filter((e) => !VALID.test(e)) };
}

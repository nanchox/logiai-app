// Datos legales del responsable del tratamiento. Los textos citan estos valores; se configuran con variables de entorno
// (solo servidor) para no depender del código. Si falta alguno, los textos lo muestran como pendiente y el administrador ve un aviso en Perfil.
export const POLICY_VERSION = "2026-10-19";
export const POLICY_DATE = "19 de octubre de 2026";

const PENDING = "(pendiente de configurar)";

export function legalContact() {
  const name = process.env.LEGAL_NAME?.trim() || "El Lugar de Su Presencia";
  const nit = process.env.LEGAL_ID?.trim() || "";
  const address = process.env.LEGAL_ADDRESS?.trim() || "";
  const email = process.env.LEGAL_EMAIL?.trim() || "";
  const phone = process.env.LEGAL_PHONE?.trim() || "";
  return {
    name,
    nit: nit || PENDING,
    address: address || PENDING,
    email: email || PENDING,
    phone: phone || "",
    /** Faltan datos que la ley exige informar (identificación y un canal de contacto). */
    incomplete: !nit || !address || !email,
  };
}

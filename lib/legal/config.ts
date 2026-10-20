// Quién administra LogiAI y cómo contactarlo. Los textos legales citan estos valores; se configuran con variables de entorno
// (solo servidor). Para una persona natural bastan tres datos: nombre, ciudad y correo de contacto. Si falta alguno, los textos lo
// muestran como pendiente y el administrador ve un aviso en su Perfil.
export const POLICY_VERSION = "2026-10-19";
export const POLICY_DATE = "19 de octubre de 2026";

const PENDING = "(pendiente de configurar)";

export function legalContact() {
  const name = process.env.LEGAL_NAME?.trim() || "";
  const city = process.env.LEGAL_CITY?.trim() || "";
  const email = process.env.LEGAL_EMAIL?.trim() || "";
  const org = process.env.LEGAL_ORG?.trim() || "El Lugar de Su Presencia";
  return {
    name: name || PENDING,
    city: city || PENDING,
    email: email || PENDING,
    org,
    /** Faltan datos que la política debe informar (quién es el responsable y un canal de contacto). */
    incomplete: !name || !city || !email,
  };
}

import Link from "next/link";
import { legalContact, POLICY_DATE, POLICY_VERSION } from "@/lib/legal/config";

const h2 = "mt-8 text-lg font-extrabold";
const ul = "mt-2 list-disc space-y-1 pl-6";

export function LegalShell({ title, children, back }: { title: string; children: React.ReactNode; back: { href: string; label: string } }) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <p className="text-sm"><Link href={back.href}>← {back.label}</Link></p>
      <h1 className="mt-3 text-3xl font-extrabold">{title}</h1>
      <p className="mt-1 text-sm text-muted">Versión {POLICY_VERSION} · vigente desde el {POLICY_DATE}</p>
      <div className="mt-4 space-y-3 leading-relaxed">{children}</div>
      <nav aria-label="Documentos legales" className="mt-10 flex flex-wrap gap-4 border-t border-line pt-4 text-sm">
        <Link href="/politica">Política de tratamiento de datos personales</Link>
        <Link href="/terminos">Términos y condiciones</Link>
      </nav>
    </main>
  );
}

export function PrivacyPolicy() {
  const c = legalContact();
  return (
    <>
      <p>
        Esta política explica, en pocas palabras, qué datos tuyos guarda LogiAI, para qué los usa y cómo puedes pedir que los corrijamos o los eliminemos. Se hace en
        cumplimiento de la <strong>Ley 1581 de 2012</strong> y el <strong>Decreto 1377 de 2013</strong> (compilado en el Decreto 1074 de 2015), sobre protección de datos personales en Colombia.
      </p>

      <h2 className={h2}>1. Quién es el responsable</h2>
      <p>
        LogiAI es administrada por <strong>{c.name}</strong> ({c.city}) para el equipo de logística del ministerio {c.org}. Para cualquier consulta o reclamo sobre tus datos,
        escribe a <strong>{c.email}</strong>.
      </p>

      <h2 className={h2}>2. Qué datos guardamos</h2>
      <ul className={ul}>
        <li>Tu <strong>nombre</strong> y tu <strong>correo</strong> de Google (no recibimos tu contraseña ni guardamos tu foto).</li>
        <li>Tu <strong>sede, grupo y rol</strong> en el servicio, y las <strong>posiciones</strong> que se te asignan.</li>
        <li>La fecha en que aceptaste esta política y cuántas preguntas haces al asistente cada día (para el límite diario).</li>
        <li><strong>Solo si activas los avisos al teléfono</strong> (es opcional): un identificador técnico de tu dispositivo (la dirección que da tu navegador para enviarte avisos) y qué avisos quieres recibir.</li>
        <li><strong>No guardamos el contenido de tus conversaciones con el asistente.</strong></li>
      </ul>

      <h2 className={h2}>3. Para qué los usamos</h2>
      <p>
        Solo para organizar el servicio: dejarte entrar si te invitaron, mostrarte el manual de tu sede, tu grupo y tus posiciones, y que tu coordinador o líder pueda planear el equipo.
        No vendemos tus datos, no los usamos para publicidad y no los compartimos con fines comerciales.
      </p>

      <h2 className={h2}>4. Dato sensible</h2>
      <p>
        Servir en un equipo de una iglesia puede sugerir tus <strong>convicciones religiosas</strong>, que la ley trata como dato sensible. Por eso te pedimos una autorización expresa.
        Es <strong>facultativa</strong>: no estás obligado a darla, pero sin ella no podemos darte acceso, porque la aplicación existe únicamente para organizar ese servicio.
        No usamos estos datos para nada más.
      </p>

      <h2 className={h2}>5. Quién los ve y con quién se procesan</h2>
      <ul className={ul}>
        <li><strong>Tu correo es privado:</strong> solo lo ves tú y quien te administra (tu coordinador, el líder de tu sede, la cabeza de ministerio y el administrador).</li>
        <li><strong>Tu nombre, rol y posiciones</strong> los ve tu grupo y quienes administran tu sede (las posiciones, cuando la planeación se publica).</li>
        <li>
          Para funcionar usamos proveedores que pueden tener sus servidores fuera de Colombia: <strong>Supabase</strong> (base de datos e inicio de sesión), <strong>Vercel</strong> (alojamiento),{" "}
          <strong>Google</strong> (inicio de sesión) y <strong>OpenRouter</strong> con su modelo de inteligencia artificial (reciben el texto de tu pregunta al asistente, tu rol, sede, grupo y posiciones,{" "}
          <strong>nunca tu nombre ni tu correo</strong>; no escribas datos personales en el asistente). Los avisos opcionales los entrega el servicio de tu navegador o teléfono (Google, Apple o Mozilla): reciben el texto del aviso («piden apoyo en tu sede», «faltan los conteos»), que <strong>no incluye nombres ni correos</strong>. Al aceptar autorizas esta transmisión y transferencia, solo para prestarte el servicio.
        </li>
      </ul>

      <h2 className={h2}>6. Tus derechos y cómo ejercerlos</h2>
      <p>Tienes derecho a conocer, actualizar y rectificar tus datos, pedir prueba de tu autorización, acceder a ellos gratis, y revocar la autorización o pedir que los eliminemos.</p>
      <ul className={ul}>
        <li><strong>En la aplicación, en Perfil:</strong> corriges tu nombre, ves cuándo aceptaste, <strong>descargas tus datos</strong> y puedes <strong>eliminar tu cuenta cuando quieras</strong>. Es inmediato.</li>
        <li><strong>Por correo</strong> a {c.email}. Respondemos las consultas en máximo <strong>10 días hábiles</strong> y los reclamos en máximo <strong>15 días hábiles</strong>.</li>
        <li>Si no te resolvemos, puedes presentar una queja ante la <strong>Superintendencia de Industria y Comercio (SIC)</strong>.</li>
      </ul>

      <h2 className={h2}>7. Qué pasa si eliminas tu cuenta</h2>
      <p>
        Se borran de inmediato tu nombre, tu correo, tu pertenencia a grupos, tus asignaciones, tus dispositivos de avisos, tu constancia de aceptación y tu invitación. Para volver, tu coordinador o líder tendría que
        invitarte de nuevo. Las novedades que publicaste quedan sin tu nombre. Los proveedores pueden conservar copias de seguridad por un tiempo limitado, solo para recuperación ante fallos.
      </p>

      <h2 className={h2}>8. Seguridad, menores y cambios</h2>
      <p>
        Entras solo por invitación, la comunicación es cifrada y los permisos por rol los aplica la propia base de datos. La aplicación es para personas mayores de edad; si un menor sirve en el
        equipo, sus padres o representantes deben autorizar el tratamiento de sus datos. Conservamos tus datos mientras tengas cuenta. Si cambiamos esta política de forma importante, te pediremos
        aceptarla de nuevo.
      </p>
    </>
  );
}

export function Terms() {
  const c = legalContact();
  return (
    <>
      <p>
        LogiAI es una herramienta del ministerio {c.org}, administrada por {c.name}, para que el equipo consulte el manual de logística, vea cuándo sirve su grupo y qué posición le
        corresponde, y resuelva dudas con un asistente de inteligencia artificial. Al usarla aceptas estos términos.
      </p>

      <h2 className={h2}>1. Acceso</h2>
      <p>Entras solo por invitación, con tu cuenta de Google. La cuenta es personal: no la compartas. Para usar la aplicación debes aceptar la Política de tratamiento de datos personales.</p>

      <h2 className={h2}>2. Uso adecuado</h2>
      <ul className={ul}>
        <li>Úsala solo para el servicio del ministerio y no compartas su contenido (manual, mapas, planeaciones) fuera del equipo sin autorización.</li>
        <li>No intentes ver información que tu rol no permite ni dañar o sobrecargar la aplicación.</li>
        <li>Si publicas novedades, notas o archivos, procura que sean veraces y respetuosos y no incluyas datos personales de otras personas sin su permiso.</li>
      </ul>

      <h2 className={h2}>3. El asistente de inteligencia artificial</h2>
      <p>
        Responde con lo que está cargado en la aplicación, pero <strong>puede equivocarse o no encontrar la información</strong>: confirma lo importante con tu coordinador o líder. No lee los
        archivos de programación, no hace acciones por ti y tiene un límite diario de preguntas. No escribas en él datos personales.
      </p>

      <h2 className={h2}>4. Avisos al teléfono</h2>
      <p>Son opcionales: solo los recibes si los activas en Perfil, puedes elegir cuáles y desactivarlos cuando quieras. Solo avisan que hay algo por hacer.</p>

      <h2 className={h2}>5. Disponibilidad</h2>
      <p>Procuramos que funcione siempre, pero puede haber interrupciones. La planeación es una ayuda de organización: ante un cambio de última hora, manda la indicación de tu coordinador o líder.</p>

      <h2 className={h2}>6. Baja</h2>
      <p>
        Puedes <strong>eliminar tu cuenta cuando quieras</strong> desde Perfil. El ministerio puede retirar el acceso a quien incumpla estos términos o deje de servir en el equipo.
      </p>

      <h2 className={h2}>7. Cambios y contacto</h2>
      <p>Si estos términos cambian de forma importante, te pediremos aceptarlos de nuevo. Se rigen por las leyes de Colombia. Para cualquier duda escribe a {c.email}.</p>
    </>
  );
}

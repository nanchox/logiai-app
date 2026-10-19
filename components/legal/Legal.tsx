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
        Esta política explica cómo <strong>{c.name}</strong> trata tus datos personales en LogiAI, el Asistente de Logística de la Iglesia, y cómo ejerces tus derechos. Se
        expide en cumplimiento del artículo 15 de la Constitución Política de Colombia, la <strong>Ley 1581 de 2012</strong> (régimen general de protección de datos
        personales) y el <strong>Decreto 1377 de 2013</strong>, compilado en el Decreto Único 1074 de 2015.
      </p>

      <h2 className={h2}>1. Responsable del tratamiento</h2>
      <ul className={ul}>
        <li><strong>Responsable:</strong> {c.name}</li>
        <li><strong>NIT o identificación:</strong> {c.nit}</li>
        <li><strong>Dirección:</strong> {c.address}</li>
        <li><strong>Correo para consultas y reclamos:</strong> {c.email}</li>
        {c.phone && <li><strong>Teléfono:</strong> {c.phone}</li>}
      </ul>

      <h2 className={h2}>2. Qué datos tratamos</h2>
      <ul className={ul}>
        <li><strong>Datos de tu cuenta de Google al ingresar:</strong> tu nombre, tu foto y tu correo electrónico. No recibimos tu contraseña de Google.</li>
        <li><strong>Datos de tu servicio:</strong> la sede, el horario y el grupo al que perteneces, tu rol (voluntario, supervisor, coordinador, líder de sede, cabeza de ministerio o administrador), las posiciones que se te asignan en cada servicio y el historial de esas asignaciones.</li>
        <li><strong>Datos de uso:</strong> el conteo diario de preguntas al asistente (para aplicar el límite diario) y la fecha en que aceptaste esta política. <strong>No guardamos el contenido de tus conversaciones con el asistente.</strong></li>
        <li><strong>Contenido que cargas:</strong> si eres coordinador, supervisor o líder, las novedades, notas y archivos de programación que publiques, que quedan asociados a tu rol.</li>
      </ul>

      <h2 className={h2}>3. Datos sensibles</h2>
      <p>
        Tu participación como servidor en una iglesia puede revelar tus <strong>convicciones religiosas</strong>, que la ley considera un dato sensible (artículo 5 de la Ley 1581).
        Por eso te pedimos una autorización <strong>expresa</strong>. Es <strong>facultativa</strong>: no estás obligado a darla. Sin ella no podemos darte acceso a la aplicación,
        porque su único propósito es organizar el servicio del ministerio. No tratamos datos sensibles para ninguna otra finalidad, no los usamos para perfilarte y no los
        entregamos a terceros distintos de los proveedores técnicos descritos más abajo.
      </p>

      <h2 className={h2}>4. Para qué los usamos (finalidades)</h2>
      <ul className={ul}>
        <li>Verificar tu identidad y permitirte ingresar solo si fuiste invitado por tu coordinador o líder de sede.</li>
        <li>Organizar el servicio: mostrarte el manual de tu sede, tu grupo, las fechas en que sirve tu grupo y las posiciones que te corresponden.</li>
        <li>Permitir que tu coordinador, supervisor, líder de sede o la cabeza de ministerio administren y planeen el equipo.</li>
        <li>Comunicarte novedades de tu iglesia, sede, día o grupo dentro de la aplicación.</li>
        <li>Responder tus preguntas con el asistente de inteligencia artificial.</li>
        <li>Mantener la seguridad de la aplicación y cumplir obligaciones legales.</li>
      </ul>
      <p className="mt-2">No vendemos tus datos, no los usamos para publicidad y no los compartimos con fines comerciales.</p>

      <h2 className={h2}>5. Quién puede ver tus datos dentro de la aplicación</h2>
      <ul className={ul}>
        <li><strong>Tu correo es privado:</strong> solo lo ves tú y quien te administra (tu coordinador, el líder de tu sede, la cabeza de ministerio y el administrador). Los demás integrantes de tu grupo no lo ven.</li>
        <li><strong>Tu nombre y tu rol</strong> los ven las personas de tu grupo y quienes administran tu sede.</li>
        <li><strong>Tus posiciones</strong> las ve tu grupo cuando la planeación se publica; mientras es borrador, solo coordinadores y supervisores.</li>
        <li>Las novedades que publiques muestran tu nombre y rol; si eliminas tu cuenta, se borran ese nombre y ese rol.</li>
      </ul>

      <h2 className={h2}>6. Proveedores, transmisión y transferencia internacional</h2>
      <p>
        Para operar la aplicación usamos proveedores que tratan datos por nuestra cuenta (encargados) y que pueden tener sus servidores fuera de Colombia, por ejemplo en
        Estados Unidos o la Unión Europea:
      </p>
      <ul className={ul}>
        <li><strong>Supabase</strong>: base de datos, inicio de sesión y almacenamiento de archivos.</li>
        <li><strong>Vercel</strong>: alojamiento de la aplicación.</li>
        <li><strong>Google</strong>: inicio de sesión con tu cuenta de Google.</li>
        <li><strong>OpenRouter y el proveedor del modelo de inteligencia artificial</strong>: reciben el texto de tu pregunta al asistente, junto con contenido del manual y datos mínimos de tu servicio (rol, sede, grupo y posiciones). <strong>Nunca reciben tu correo ni tu nombre.</strong> No escribas datos personales tuyos o de otras personas en el asistente.</li>
      </ul>
      <p className="mt-2">
        Al aceptar esta política autorizas expresamente esta transmisión y transferencia, que solo se hace para prestarte el servicio (artículo 26 de la Ley 1581, literal a).
      </p>

      <h2 className={h2}>7. Tus derechos como titular</h2>
      <p>De acuerdo con el artículo 8 de la Ley 1581 tienes derecho a:</p>
      <ul className={ul}>
        <li>Conocer, actualizar y rectificar tus datos personales.</li>
        <li>Solicitar prueba de la autorización que nos diste.</li>
        <li>Ser informado, previa solicitud, del uso que se ha dado a tus datos.</li>
        <li>Presentar quejas ante la <strong>Superintendencia de Industria y Comercio (SIC)</strong> por infracciones a la ley, una vez agotado el trámite de consulta o reclamo ante nosotros.</li>
        <li><strong>Revocar la autorización y solicitar la supresión de tus datos</strong> cuando no se respeten los principios, derechos y garantías, o cuando simplemente decidas retirarte.</li>
        <li>Acceder de forma gratuita a tus datos personales.</li>
      </ul>

      <h2 className={h2}>8. Cómo ejercer tus derechos</h2>
      <ul className={ul}>
        <li><strong>Directamente en la aplicación, en Perfil:</strong> puedes ver los datos que tenemos de ti y descargarlos (acceso), ver la fecha y versión de tu aceptación, y <strong>eliminar tu cuenta cuando quieras</strong> (revocatoria y supresión). Es inmediato y no necesitas pedir permiso.</li>
        <li><strong>Por correo</strong> a {c.email}, indicando tu nombre y qué quieres hacer (consultar, rectificar, probar la autorización, reclamar).</li>
      </ul>
      <p className="mt-2">
        Responderemos las <strong>consultas en máximo 10 días hábiles</strong> y los <strong>reclamos en máximo 15 días hábiles</strong> desde su recibo. Si no podemos hacerlo en ese plazo,
        te avisaremos el motivo y la nueva fecha, que no superará 5 días hábiles más (consultas) u 8 días hábiles más (reclamos), según los artículos 14 y 15 de la Ley 1581.
      </p>

      <h2 className={h2}>9. Qué pasa cuando eliminas tu cuenta</h2>
      <p>
        Se borran de inmediato tu perfil, tu correo, tu pertenencia a grupos, tus asignaciones de posiciones, tu constancia de aceptación y tu invitación (para volver a entrar,
        tu coordinador o líder tendría que invitarte de nuevo). Las novedades que publicaste permanecen sin tu nombre ni tu rol. Los proveedores técnicos pueden conservar copias
        de seguridad por un tiempo limitado hasta que se sobrescriban, y solo para recuperación ante fallos.
      </p>

      <h2 className={h2}>10. Seguridad</h2>
      <p>
        Aplicamos medidas técnicas y administrativas razonables: ingreso únicamente por invitación, comunicación cifrada, permisos por rol aplicados en la propia base de datos y
        el correo guardado en una tabla privada. Ningún sistema es infalible; si ocurre un incidente que afecte tus datos, lo informaremos a quienes corresponda, incluida la SIC.
      </p>

      <h2 className={h2}>11. Menores de edad</h2>
      <p>
        LogiAI está dirigida a personas mayores de edad. Si el ministerio vincula a menores de 18 años como voluntarios, el tratamiento de sus datos requiere la autorización de sus
        padres o representantes legales y se hará respetando el interés superior del menor (artículo 7 de la Ley 1581).
      </p>

      <h2 className={h2}>12. Vigencia y cambios</h2>
      <p>
        Tus datos se conservan mientras tengas cuenta o hasta que ejerzas tu derecho de supresión. Si cambiamos esta política de forma sustancial, publicaremos la nueva versión y te
        pediremos que la aceptes de nuevo la próxima vez que ingreses.
      </p>
    </>
  );
}

export function Terms() {
  const c = legalContact();
  return (
    <>
      <p>
        Estos términos regulan el uso de LogiAI, el Asistente de Logística de la Iglesia, ofrecido por <strong>{c.name}</strong>. Al aceptarlos y usar la aplicación, te
        comprometes a cumplirlos.
      </p>

      <h2 className={h2}>1. Qué es LogiAI</h2>
      <p>
        Es una herramienta interna del ministerio para consultar el manual de logística de tu sede (mapas, posiciones, flujos), ver las novedades, conocer cuándo sirve tu grupo y
        qué posición te corresponde, y resolver dudas con un asistente de inteligencia artificial.
      </p>

      <h2 className={h2}>2. Acceso y cuenta</h2>
      <ul className={ul}>
        <li>El acceso es solo por invitación de tu coordinador, líder de sede, la cabeza de ministerio o el administrador, e ingresas con tu cuenta de Google.</li>
        <li>La cuenta es personal: no la compartas ni ingreses a nombre de otra persona.</li>
        <li>Debes aceptar la Política de Tratamiento de Datos Personales para usar la aplicación.</li>
      </ul>

      <h2 className={h2}>3. Uso adecuado</h2>
      <ul className={ul}>
        <li>Usa la aplicación solo para el servicio del ministerio.</li>
        <li>El contenido (manual, mapas, planeaciones, novedades) es de uso interno: no lo publiques ni lo compartas fuera del equipo sin autorización.</li>
        <li>No intentes acceder a información que tu rol no te permite ver, ni vulnerar o sobrecargar la aplicación.</li>
        <li>Si publicas novedades, notas o archivos, eres responsable de que sean veraces y respetuosos y de no incluir datos personales de terceros sin su autorización.</li>
      </ul>

      <h2 className={h2}>4. El asistente de inteligencia artificial</h2>
      <ul className={ul}>
        <li>Responde con lo que está cargado en la aplicación y con una guía de uso, pero <strong>puede equivocarse o no encontrar la información</strong>. Confirma lo importante con tu coordinador o líder.</li>
        <li>No lee los archivos de programación y no realiza acciones por ti en la aplicación.</li>
        <li>Tiene un límite diario de preguntas por persona.</li>
        <li>No escribas en él datos personales tuyos ni de otros. Qué datos reciben los proveedores de IA está explicado en la Política de Tratamiento de Datos Personales.</li>
      </ul>

      <h2 className={h2}>5. Disponibilidad</h2>
      <p>
        Procuramos que la aplicación funcione de forma continua, pero puede haber interrupciones por mantenimiento o por fallas de los proveedores. La planeación y las fechas son
        una ayuda de organización; ante un cambio de última hora, la indicación de tu coordinador o líder prevalece.
      </p>

      <h2 className={h2}>6. Suspensión y baja</h2>
      <p>
        Puedes dejar de usar la aplicación y <strong>eliminar tu cuenta en cualquier momento</strong> desde Perfil. El ministerio puede restringir o retirar el acceso a quien incumpla
        estos términos o deje de servir en el equipo.
      </p>

      <h2 className={h2}>7. Propiedad</h2>
      <p>
        La aplicación, su diseño y el contenido que el ministerio carga pertenecen a {c.name} o a quienes los crearon, y se te permite usarlos únicamente para servir en el equipo.
      </p>

      <h2 className={h2}>8. Cambios, ley aplicable y contacto</h2>
      <p>
        Podemos actualizar estos términos; si el cambio es sustancial, te pediremos aceptarlos de nuevo. Se rigen por las leyes de la República de Colombia. Para cualquier duda
        escribe a {c.email}.
      </p>
    </>
  );
}

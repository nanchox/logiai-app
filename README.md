# LogiAI

Manual de logística y servicio de **El Lugar de Su Presencia**: mapas, posiciones, indicaciones, novedades y chat con IA.
El plan completo está en [`PLAN.md`](PLAN.md). Estado actual: **Fases 1 a 6** completas (base, login, permisos, manual con mapas y posiciones, fotos, videos, flujos, personas y grupos, novedades, rotación y servicio, y el asistente de IA). Sigue el lanzamiento ampliado (PWA y publicación a unas 2000 personas).

- **App:** Next.js 16 (App Router) en Vercel · **Datos, login y archivos:** Supabase
- `legacy/` — prototipo original (HTML estático) y las imágenes de mapas de Castellana
- `supabase/migrations/` — esquema, permisos (RLS), acceso por invitación, storage y carga inicial
- `supabase/tests/` — pruebas de permisos sobre Postgres en WASM

## Puesta en marcha

### 1. Supabase
1. Crea un proyecto en [supabase.com](https://supabase.com).
2. Aplica las migraciones, **en orden**. Con la CLI:
   ```bash
   npx supabase login
   npx supabase link --project-ref <ref>
   npx supabase db push
   ```
   (o pega cada archivo de `supabase/migrations/` en *SQL Editor*, en orden). Al llegar una fase nueva basta repetir `npx supabase db push`: solo aplica las migraciones que falten.
3. **Authentication → Sign In / Providers → Google**: actívalo con el *Client ID* y *Client Secret* de Google Cloud
   (cliente OAuth tipo "Aplicación web"; en Google, *URI de redireccionamiento autorizado* = `https://<ref>.supabase.co/auth/v1/callback`).
4. **Authentication → URL Configuration**: *Site URL* = la URL de Vercel; en *Redirect URLs* agrega
   `https://<tu-app>.vercel.app/auth/callback` y `http://localhost:3000/auth/callback`.
5. **Authentication → Hooks → Before User Created**: elige *Postgres function* → `public.hook_before_user_created`.
   (Aunque no lo actives, el trigger `on_auth_user_created` ya impide crear cuentas sin invitación; el hook solo da un mensaje más claro.)

### 2. Variables de entorno
Copia `.env.example` a `.env.local` y complétalo. En Vercel agrega `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
`SUPABASE_SERVICE_ROLE_KEY` es secreta: solo para scripts locales, nunca en Vercel ni en el navegador.

### 3. Imágenes de la carga inicial
```bash
npm install
npm run seed:assets     # sube legacy/*.png al bucket "maps"
```

### 4. Desarrollo
```bash
npm run dev             # http://localhost:3000
npm run typecheck && npm run lint
npm test                # pruebas unitarias (enlaces de YouTube) + permisos de la base de datos
```

## Editar el manual
Quienes pueden editar: **administrador, cabeza de ministerio y líder de la sede** (en su sede). Los demás roles solo ven.

- **Manual → sede → espacio** y pulsar **✎ Editar**.
- **Pines:** arrástralos (o selecciónalos y usa las flechas; Mayús = pasos grandes) y pulsa *Guardar pines*. En las zonas hay dos variantes de coordenadas, *Escritorio* y *Móvil*; si una posición no tiene pin móvil se usa el de escritorio.
- **Posiciones:** *＋ Nueva posición* o *Editar* en la lista. Se les puede marcar día y franja (sin marcar = todos), radio, y ocultarlas. Ahí mismo se agregan **fotos** (se comprimen a 1600 px), **videos de YouTube** (solo enlaces de youtube.com / youtu.be) y enlaces https.
- **Mapas y zonas:** panel *Mapas y zonas de este espacio* para agregar, reemplazar la imagen, renombrar o eliminar. Los pines están en porcentajes, así que al reemplazar un mapa conviene mantener las proporciones.
- **Espacios** (auditorio, teatro, overflow, salones…): en la página de la sede, *Agregar espacio* / *Editar espacio*.
- **Flujos de ubicación:** en la sede, *Flujos de ubicación* → pasos ordenados, cada uno con su espacio e indicaciones.

Quien no es de la sede no ve nada de ella, y las reglas las aplica la base de datos, no solo la interfaz.

## Personas y grupos
Nadie crea cuenta sin una invitación (un correo agregado). Se administra en **Personas** (menú superior):

| Quién | Qué puede hacer |
|---|---|
| **Coordinador** | En **su** grupo: agregar correos como Supervisor o Voluntario, cambiar entre esos dos roles y eliminar de la aplicación a supervisores y voluntarios. |
| **Líder de sede** | En **todos los grupos de su sede**: agregar con cualquier rol (incluido Coordinador), mover personas entre grupos y horarios de su sede, y crear horarios y grupos. |
| **Cabeza de ministerio** | Lo mismo en **todas las sedes**, y mover personas entre sedes. También invita y elimina líderes de sede. |
| **Administrador** | Todo lo anterior, e invita o elimina a otras cabezas y administradores. |

- **Agregar correos:** pega uno o varios (uno por línea o separados por comas), elige grupo y rol. La persona entra con Google usando ese correo y queda en su grupo con su rol. Los correos repetidos o inválidos se informan sin tocar nada.
- **No se "quita de un grupo":** una persona está siempre en un solo grupo. Se puede **moverla** (a otro grupo, horario o sede), **cambiarle el rol** o **eliminarla de la aplicación**. Eliminar borra su cuenta y su invitación; si debe volver, hay que invitarla de nuevo. Su sesión abierta se cierra sola.
- **Correos privados:** los correos viven en la tabla `profile_private`. Solo los ve cada persona (el suyo) y quien la administra (su coordinador, el líder de su sede, la cabeza y el administrador). Supervisores y voluntarios ven los **nombres** de su grupo en **Mi grupo**, nunca los correos. Lo hace cumplir la base de datos (RLS), no solo la pantalla.
- **Grupos y horarios:** un horario es un día y una franja de una sede (con horas de llegada, inicio y fin); un grupo pertenece a uno. No se puede eliminar un grupo con integrantes: se mueven primero.
- Los roles globales (administrador y cabeza) se dan invitando desde **Personas → Líderes y administración** (solo el administrador).

## Novedades
Noticias, cambios y avisos en **Novedades** (menú superior); los más recientes también salen en el inicio.

| Alcance | Lo ve |
|---|---|
| Toda la iglesia | cualquier persona con cuenta |
| Una sede | quienes sirven en esa sede y su líder |
| Una sede y un día | quienes sirven ese día en esa sede y su líder |
| Un día en todas las sedes | quienes sirven ese día (y los líderes de sede) |
| Un grupo | las personas de ese grupo y el líder de la sede |

Cabeza de ministerio y administrador ven todo.

- **Quién publica, edita y elimina:** cabeza y administrador, en cualquier alcance; el **líder de sede**, en su sede (sede, sede y día, o un grupo de su sede); el **coordinador**, solo en su grupo. Supervisores y voluntarios solo leen. Lo hace cumplir la base de datos, no solo la pantalla.
- **Tipo** (anuncio, cambio o noticia; todos aparecen en Novedades), **fijar arriba**, hasta 5 **enlaces** (solo `https`) y los enlaces escritos dentro del texto también se pueden abrir.
- **Vigencia:** se puede programar la publicación y dar una fecha de fin. Quien lo administra ve también los programados y los vencidos, marcados como tales; los demás, solo los vigentes. Las fechas se escriben y se muestran en hora de Colombia.
- Cada novedad muestra quién la publicó, con su nombre y rol (nunca su correo).

## Rotación y servicio
- **Rotación** (Personas → Rotación, para líder de sede, cabeza y administrador): cada horario de cada sede rota sus grupos semana a semana, de forma **independiente** a las demás sedes. El líder ordena los grupos, genera las fechas (hasta 400 días por vez) y, si agrega un grupo, vuelve a generar hacia adelante: lo ajustado a mano y los servicios especiales no se tocan, y un servicio que ya tiene planeación o archivos conserva su grupo.
- **Cancelaciones:** una fecha cancelada **consume su turno** (ese grupo lo pierde y la rotación sigue por calendario). El líder cancela un horario o todos los de su sede; cabeza y administrador, también todas las sedes. Los coordinadores solo ven el calendario.
- **Servicios especiales:** se crean a mano (fecha, grupo y nota) y no entran en la rotación.
- **Mi servicio:** el próximo servicio del grupo, el calendario de las próximas 8 semanas y el historial de posiciones de cada persona (de la planeación publicada).
- **Planeación de posiciones** (coordinadores y supervisores del grupo que sirve, y el líder de la sede): se asignan personas a las posiciones del manual que aplican a ese día y franja. Una posición puede tener varias personas y una persona varias posiciones; cada posición admite una nota. **Los coordinadores coordinan el grupo y no ocupan posiciones**; las posiciones de supervisor son solo para supervisores. El **borrador** lo ven solo coordinadores y supervisores; al **publicar**, todo el grupo. Se puede copiar la planeación del servicio anterior como punto de partida. No hay confirmación de asistencia.
- **Programación en archivo:** en lugar de (o además de) la planeación en la plataforma, se puede subir la programación como PDF, Excel o imagen (hasta 5 archivos de 10 MB por servicio). La ve todo el grupo con enlaces firmados.

## Asistente (chat IA)
Pantalla **Asistente** (menú superior), para cualquier persona con cuenta. Responde dudas con lo que está cargado: posiciones del manual, flujos y novedades vigentes.

- **Conversa en lo básico:** saluda, dice quién es (el Asistente de LogiAI, una IA), para qué fue creado y cuál es su alcance, y guía con «¿qué puedo hacer?» usando una guía de la aplicación **adaptada al rol** de la persona (un voluntario no recibe opciones de administración). Fuera de su alcance (temas ajenos a la aplicación) lo dice con amabilidad. Esas respuestas no necesitan fuentes.
- **Solo con lo cargado (datos de logística):** en cada pregunta el servidor busca en español (texto completo de Postgres) y le pasa al modelo únicamente los fragmentos encontrados y unos pocos datos de la persona (rol, sede, grupo, próximo servicio y sus posiciones publicadas). Si no está en lo cargado, el asistente lo dice. Cita las fuentes con enlace (los enlaces los arma el servidor, no el modelo).
- **Permisos:** la búsqueda corre **con la sesión de la persona**, así que solo encuentra lo que sus permisos (RLS) le dejan ver: una voluntaria de Castellana nunca recibe contenido de Nogal.
- **Privacidad:** no se envían correos ni nombres al modelo. El contenido de las novedades se entrega como datos, con la instrucción de no obedecer órdenes escritas dentro.
- **No usa herramientas:** los modelos gratuitos que rotan no las soportan de forma fiable. Tampoco lee el contenido de los archivos de programación (PDF, Excel, imágenes).
- **Límite diario:** `CHAT_DAILY_LIMIT` preguntas por persona y por día (30 por defecto, hora de Colombia), porque los modelos gratuitos tienen cupo.
- **Configuración (Vercel → Environment Variables, solo servidor):** `OPENROUTER_API_KEY` (la clave de openrouter.ai), `OPENROUTER_MODEL` (uno o varios IDs de modelos gratuitos separados por coma, se prueban en orden si uno falla o está saturado; por defecto `openrouter/free`) y, opcionalmente, `CHAT_DAILY_LIMIT`. Sin la clave, la pantalla avisa que el asistente no está configurado. Los IDs de modelos gratuitos cambian con el tiempo: revísalos en openrouter.ai/models (filtro «free») y ajusta la variable sin tocar el código.

## Protección de datos personales (Colombia)
La aplicación aplica la **Ley 1581 de 2012** (habeas data), el **Decreto 1377 de 2013** (compilado en el Decreto 1074 de 2015) y el artículo 15 de la Constitución.

- **Aceptación la primera vez:** al ingresar, toda persona debe aceptar la **Política de tratamiento de datos personales** (autorización previa, expresa e informada, incluida la de datos sensibles —su servicio en una iglesia puede revelar convicciones religiosas— y la transmisión a proveedores en el exterior) y los **Términos y condiciones**. Sin aceptar no entra a ninguna pantalla ni al asistente. Queda una constancia (versión y fecha) que solo ve la propia persona. Si cambias los textos, sube `POLICY_VERSION` en `lib/legal/config.ts` y todos tendrán que aceptar de nuevo.
- **Perfil** (clic en tu nombre arriba): correo, rol, sede y grupo; rectificar el nombre; ver cuándo aceptó; leer la política y los términos; **descargar sus datos** (derecho de acceso, JSON) y **eliminar su cuenta** cuando quiera (revocatoria y supresión, inmediata). Al eliminar se borran perfil, correo, grupo, asignaciones, constancia e invitación; las novedades que publicó quedan sin su nombre ni su rol.
- **El administrador y la cabeza** no se eliminan a sí mismos (otro administrador lo hace), para que la aplicación nunca se quede sin quien la administre.
- **`/politica` y `/terminos` son públicas** (se ven también antes de ingresar) y están enlazadas en el login.
- **Datos legales del responsable** (obligatorios en la política): configura en Vercel `LEGAL_NAME`, `LEGAL_ID` (NIT), `LEGAL_ADDRESS`, `LEGAL_EMAIL` y, si quieres, `LEGAL_PHONE`. Mientras falten, la política muestra «pendiente de configurar» y el administrador ve un aviso en su Perfil.
- **Revisión jurídica:** los textos son una base sólida pero **debe revisarlos un abogado** antes del lanzamiento. Puntos a confirmar con él: si el ministerio debe inscribir sus bases de datos en el **Registro Nacional de Bases de Datos (RNBD)** de la SIC (depende del tamaño y de la naturaleza de la entidad), la vinculación de **menores de edad**, las finalidades, y el pie de página con los datos del responsable.

## Actualizar una instalación existente
Cada fase nueva trae migraciones. El orden seguro es:
1. Publica primero el código nuevo (fusiona el pull request y espera el despliegue de Vercel).
2. Luego aplica las migraciones: `npx supabase db push`.

Notas por fase: la `20261019000001_people.sql` quita el correo de `profiles` y lo mueve a `profile_private`; la `20261020000001_announcements.sql` crea los anuncios (hasta aplicarla, el inicio muestra «No hay anuncios por ahora»); la `20261021000001_rotation.sql` crea la rotación, la planeación y el bucket privado `schedules` (hasta aplicarla, Mi servicio y Rotación no funcionan); la `20261022000001_chat.sql` crea la búsqueda y el límite diario del asistente; la `20261023000001_privacy.sql` crea la constancia de aceptación y la baja de cuenta (es aditiva: hasta aplicarla, la aplicación no pide aceptar los textos).

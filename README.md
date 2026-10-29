# LogiAI

Manual de logística y servicio de **El Lugar de Su Presencia**: mapas, posiciones, indicaciones, novedades y chat con IA.
El plan completo está en [`PLAN.md`](PLAN.md). Estado actual: **Fases 1 a 9** completas (base, login, permisos, manual con mapas y posiciones, fotos, videos, flujos, personas y grupos, novedades, rotación y servicio, el asistente de IA, reemplazos y apoyos, conteos y totales, y la aplicación instalable con avisos al teléfono). Queda pendiente la publicación ampliada a unas 2000 personas (Supabase Pro y sacar el consentimiento de Google del modo «Testing»).

- **App:** Next.js 16 (App Router) en Vercel · **Datos, login y archivos:** Supabase
- `legacy/` — prototipo original (HTML estático) y las imágenes de mapas de Castellana
- `supabase/migrations/` — esquema, permisos (RLS), acceso por invitación, storage y carga inicial
- `supabase/tests/` — pruebas de permisos (RLS) sobre Postgres en WASM
- `app/` — pantallas y rutas (`app/api/`: asistente, avisos, solicitudes de apoyo y tarea programada) · `lib/` — lógica por tema (manual, personas, novedades, servicio, apoyos, conteos, chat, avisos) · `components/` — interfaz · `public/sw.js` — service worker · `vercel.json` — tarea programada

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
Copia `.env.example` a `.env.local` y complétalo (cada variable está comentada ahí). En Vercel agrega:

| Variable | Para qué | Dónde |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Conexión con Supabase (obligatorias) | navegador y servidor |
| `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `CHAT_DAILY_LIMIT` | Asistente de IA (ver *Asistente*) | solo servidor |
| `LEGAL_NAME`, `LEGAL_CITY`, `LEGAL_EMAIL`, `LEGAL_ORG` | Responsable de los datos en la política (ver *Protección de datos*) | solo servidor |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Avisos al teléfono | la pública va al navegador; la privada, solo servidor |
| `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET` | Buscar a quién avisar y proteger la tarea programada | solo servidor |

`SUPABASE_SERVICE_ROLE_KEY` es la clave más poderosa de Supabase: nunca con `NEXT_PUBLIC_`, nunca en el navegador ni en el repositorio. Lo opcional (asistente, avisos, datos legales) puede faltar: la aplicación funciona y solo no ofrece esa parte.

### 3. Imágenes de la carga inicial
```bash
npm install
npm run seed:assets     # sube legacy/*.png al bucket "maps"
```

### 4. Desarrollo
```bash
npm run dev             # http://localhost:3000
npm run typecheck && npm run lint
npm test                # pruebas unitarias (lógica de lib/) + permisos de la base de datos (RLS)
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
Noticias, cambios y avisos en **Novedades** (menú superior); los más recientes también salen en el inicio (resumidos, sin imágenes).

| Alcance | Lo ve |
|---|---|
| Toda la iglesia | cualquier persona con cuenta |
| Una sede | quienes sirven en esa sede y su líder |
| Una sede y un día | quienes sirven ese día en esa sede y su líder |
| Un día en todas las sedes | quienes sirven ese día (y los líderes de sede) |
| Un grupo | las personas de ese grupo y el líder de la sede |

Cabeza de ministerio y administrador ven todo.

- **Quién publica, edita y elimina:** cabeza y administrador, en cualquier alcance; el **líder de sede**, en su sede (sede, sede y día, o un grupo de su sede); el **coordinador**, solo en su grupo. Supervisores y voluntarios solo leen. Lo hace cumplir la base de datos, no solo la pantalla.
- **Tipo** (anuncio, cambio o noticia; todos aparecen en Novedades), **fijar arriba**, hasta 5 **enlaces** (solo `https`) y los enlaces escritos dentro del texto también se pueden abrir. Los enlaces se abren en **una ventana dentro de la aplicación**, con un botón «Abrir en el navegador» (algunas páginas no permiten verse incrustadas; los videos de YouTube sí). Hasta 4 **imágenes** por novedad, visibles directamente en la tarjeta (al tocarlas se ven ampliadas); pesan **máximo 1 MB**: si una es más grande, la aplicación la reduce sola antes de subirla. Se guardan en el bucket privado `announcements`.
- **Vigencia:** se puede programar la publicación y dar una fecha de fin. Quien lo administra ve también los programados y los vencidos, marcados como tales; los demás, solo los vigentes. Las fechas se escriben y se muestran en hora de Colombia.
- Cada novedad muestra quién la publicó, con su nombre y rol (nunca su correo).

## Rotación y servicio
- **Rotación** (Personas → Rotación, para líder de sede, cabeza y administrador): cada horario de cada sede rota sus grupos semana a semana, de forma **independiente** a las demás sedes. El líder ordena los grupos, genera las fechas (hasta 400 días por vez) y, si agrega un grupo, vuelve a generar hacia adelante: lo ajustado a mano y los servicios especiales no se tocan, y un servicio que ya tiene planeación o archivos conserva su grupo.
- **Cancelaciones:** una fecha cancelada **consume su turno** (ese grupo lo pierde y la rotación sigue por calendario). El líder cancela un horario o todos los de su sede; cabeza y administrador, también todas las sedes. Los coordinadores solo ven el calendario.
- **Servicios especiales:** se crean a mano (fecha, grupo y nota) y no entran en la rotación.
- **Mi servicio:** lo principal son los **servicios activos**, marcados con «● Activo · Hoy» o «● Activo · Siguiente» (los de hoy o, si no hay, el siguiente que le toca a la persona; también donde apoya). Se organiza en pestañas: **Servicios** (activos y calendario de 8 semanas), **Apoyos**, **Conteos** (coordinación y quienes administran), **Posiciones** (historial) y **Administrar** (quien administra la sede: generar más semanas de rotación, cada vez que se necesite, y accesos a rotación y cancelaciones). La página de cada servicio usa las mismas pestañas (Posiciones, Apoyos, Conteos, Administrar) y admite enlaces directos con `?tab=`.
- **Inicio (atajos):** supervisores, coordinadores, líderes de sede, cabezas y admin ven su servicio activo, un acceso rápido a Conteos y el manual de su sede (o el de logística, en el caso de cabezas y admin).
- **Planeación de posiciones** (coordinadores y supervisores del grupo que sirve, y el líder de la sede): se asignan personas a las posiciones del manual que aplican a ese día y franja. Una posición puede tener varias personas y una persona varias posiciones; cada posición admite una nota. **Los coordinadores coordinan el grupo y no ocupan posiciones**; las posiciones de supervisor son solo para supervisores. El **borrador** lo ven solo coordinadores y supervisores; al **publicar**, todo el grupo. Se puede copiar la planeación del servicio anterior como punto de partida. No hay confirmación de asistencia.
- **Programación en archivo:** en lugar de (o además de) la planeación en la plataforma, se puede subir la programación como PDF, Excel o imagen (hasta 5 archivos de 10 MB por servicio). La ve todo el grupo con enlaces firmados.

## Aplicación instalable y avisos al teléfono
- **Instalable (PWA):** LogiAI se puede instalar en la pantalla de inicio (Android y computador: botón «Instalar la aplicación» en **Perfil**; iPhone: Compartir → Agregar a pantalla de inicio) y se abre como una aplicación, con iconos y colores de marca. El service worker **no guarda páginas de la aplicación** (los datos son privados y cambian): solo una pantalla de **«Sin conexión»** autosuficiente, con un enlace para reintentar.
- **Avisos al teléfono (opcionales):** en Perfil → «Aplicación y avisos», cada persona activa los avisos **en cada dispositivo** y elige cuáles recibir. Hay dos:
  1. **Solicitud de apoyo:** cuando un grupo publica «necesitamos N personas», se avisa a quienes pueden atenderla (otro grupo de la sede, voluntarios o supervisores, sin choque de horario y con ese aviso activado). Una vez por solicitud y persona.
  2. **Conteos pendientes:** a los coordinadores y supervisores del grupo que no han registrado los conteos de un servicio de hoy o de ayer. Una tarea programada lo revisa dos veces al día (a las 9:00 y a las 20:00 hora de Colombia); a lo sumo un aviso por persona y servicio al día.
- **Privacidad:** los avisos solo dicen que hay algo por hacer (nunca nombres ni correos). Se guarda únicamente el identificador técnico del dispositivo que da el navegador, y se borra al desactivar los avisos o eliminar la cuenta. La política de datos lo explica (versión 2026-10-20: todos aceptan de nuevo al entrar).
- **iPhone:** los avisos solo funcionan si la aplicación está instalada en la pantalla de inicio (iOS 16.4 o superior).
- **Configuración en Vercel** (sin esto, la aplicación funciona igual y simplemente no ofrece los avisos):
  - `npx web-push generate-vapid-keys` → `NEXT_PUBLIC_VAPID_PUBLIC_KEY` y `VAPID_PRIVATE_KEY` (y `VAPID_SUBJECT`, un `mailto:` tuyo; si falta se usa `LEGAL_EMAIL`).
  - `SUPABASE_SERVICE_ROLE_KEY` (**solo servidor**, nunca con `NEXT_PUBLIC_`): el servidor la usa para buscar a quién avisar. Es la clave más poderosa de Supabase: no la pegues en ningún otro lugar.
  - `CRON_SECRET`: una cadena larga al azar; Vercel la envía sola a la tarea programada (`vercel.json`, dos ejecuciones diarias). En el plan gratuito de Vercel (Hobby) las tareas programadas corren una vez al día con hasta una hora de margen: confirma que tu plan admite las dos.
- **Detalle técnico:** la solicitud de apoyo se publica por el servidor (`/api/support/request`) con la sesión de quien la pide —la base de datos sigue validando permisos y reglas— y luego avisa. La lista de a quién avisar la calcula la base de datos con funciones que solo puede ejecutar el servidor.

## Reemplazos y apoyos
Cuando en un servicio planeado falta gente, el grupo suma apoyo de otros grupos **de su sede**. Todo aplica solo al **próximo servicio** del grupo (la siguiente fecha programada, no cancelada).

- **Ausencias:** en la página del servicio, el coordinador o supervisor del grupo (o el líder de la sede) marca a alguien como ausente: se le quitan sus posiciones de ese servicio, ya no se le puede asignar y la vacante queda a la vista. Se puede deshacer. No se pide motivo. Cada persona ve en Mi servicio que fue marcada.
- **Quién puede apoyar:** voluntarios y supervisores de **otro grupo de la misma sede**, **sin choque de horario** (si su grupo sirve ese día a una hora que se cruza, o ya apoya en otro servicio; si algún horario no tiene horas cargadas, se asume choque; quien está ausente de su propio servicio queda libre). Los coordinadores no apoyan: no ocupan posiciones.
- **Apoyo directo:** quien planifica busca **por nombre** y agrega a la persona. Solo ve nombre, grupo y rol, **nunca el correo**.
- **Solicitud de apoyo:** quien planifica pide «N personas» (con nota y posiciones opcionales). Solo la ven quienes pueden apoyar, en **Inicio** y en **Mi servicio** (con un contador en el menú). La persona se postula con «Quiero apoyar» y el coordinador o supervisor **aprueba o rechaza**. No se pasa del cupo; la solicitud deja de verse cuando se llena, se cancela o el servicio deja de ser el próximo, y se reabre si un apoyo se retira.
- **Un apoyo aprobado** es parte del servicio ese día: puede recibir posiciones (las de supervisor, solo si es supervisor), ve la planeación publicada y los archivos, y el servicio aparece en su Mi servicio e historial como «Apoyo a Grupo X». Puede **retirarse solo hasta el día anterior**; ese día o después debe avisar a su coordinador.
- **El grupo de origen se entera:** el coordinador ve en Mi servicio quiénes de su grupo apoyan a otros y cuándo (sin aprobar nada).
- **Avisos:** dentro de la aplicación y, para las solicitudes de apoyo, también al teléfono si la persona activó los avisos (ver *Aplicación instalable y avisos al teléfono*).
- Todas las reglas las hace cumplir la base de datos (funciones con permisos), no solo la pantalla.

## Conteos y totales
Menú **Conteos** (líder de sede, cabeza, administrador, coordinadores y supervisores). Los grupos cuentan a las personas en cada entrada de la sede; al terminar el servicio se registra cuántas entraron en cada ubicación y la aplicación lo contrasta con la capacidad.

- **Capacidad y guías** (Conteos → Capacidad y guías de conteo; líder de su sede, cabeza y administrador): el total de **sillas de cada ubicación** (una cifra para todos los servicios; vacía si esa ubicación no se cuenta) y, por **día de la semana**, una **imagen** que indica cómo y dónde contar en cada entrada. La imagen se repite cada semana hasta que se reemplace o se quite y aplica a todos los horarios de ese día. Las **entradas no se registran**: la imagen es la guía.
- **Guía en el servicio:** la ve en la página del servicio el grupo que sirve ese día (y quienes apoyan), el líder, la cabeza y el administrador. Se guarda en un almacenamiento privado, con enlaces firmados.
- **Captura:** en la página del servicio, el **coordinador o un supervisor del grupo que sirvió** registra **un total final por ubicación**. El total **no puede superar la capacidad** (la pantalla avisa y la base de datos lo rechaza); una ubicación sin capacidad no se puede contar. Se guarda todo o nada. Solo se puede desde el día del servicio y hasta el **final del día siguiente** (24 horas); después **solo corrige el líder** (o el administrador). Todo cambio queda registrado (quién, cuándo, valor anterior y nuevo) y lo ve el líder, la cabeza y el administrador.
- **Recordatorio:** si faltan los conteos de un servicio reciente, Mi servicio se lo recuerda al coordinador y a los supervisores del grupo.
- **Reporte** (solo en pantalla): por **servicio**, por **día** y por **semana de lunes a domingo**, con los totales por ubicación, capacidad y porcentaje de ocupación (calculado sobre las ubicaciones que sí se contaron), y una comparación con la semana anterior. El líder ve su sede; la cabeza y el administrador, todas, con el total consolidado; coordinadores y supervisores ven **solo los servicios de su grupo**. Los voluntarios no ven los totales.
- Los totales no son datos personales; si la persona que contó se elimina, se conservan sin su nombre.

## Asistente (chat IA)
**Asistente** para cualquier persona con cuenta, siempre a mano en todas las pantallas: **en el celular**, una barra inferior con el cuadro de preguntas activo que, al escribir, se despliega en una hoja con la conversación (se minimiza con ⌄, tocando fuera o al abrir una fuente); **en el computador**, un panel lateral que se expande y se colapsa (botón flotante, botón «Asistente» del menú o Esc) y que **empuja el contenido en vez de taparlo**. La respuesta aparece en el mismo chat, sin cambiar de pantalla, y **la conversación se conserva al navegar**; «Pantalla completa» abre `/asistente` con esa misma conversación. No se guarda en el navegador ni en el servidor: al recargar, empieza de nuevo.

Responde dudas con lo que está cargado: posiciones del manual, flujos y novedades vigentes.

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
- **Datos mínimos:** solo se guardan nombre y correo (más sede, grupo, rol y posiciones); la foto de Google ya no se guarda.
- **Perfil** (clic en tu nombre arriba): correo, rol, sede y grupo; rectificar el nombre; ver cuándo aceptó; leer la política y los términos; **descargar sus datos** (derecho de acceso, JSON) y **eliminar su cuenta** cuando quiera (revocatoria y supresión, inmediata). Al eliminar se borran perfil, correo, grupo, asignaciones, constancia e invitación; las novedades que publicó quedan sin su nombre ni su rol.
- **El administrador y la cabeza** no se eliminan a sí mismos (otro administrador lo hace), para que la aplicación nunca se quede sin quien la administre.
- **`/politica` y `/terminos` son públicas** (se ven también antes de ingresar) y están enlazadas en el login.
- **Quién administra la aplicación** (la política debe decirlo): configura en Vercel `LEGAL_NAME` (tu nombre completo), `LEGAL_CITY` (tu ciudad) y `LEGAL_EMAIL` (correo para consultas y reclamos); `LEGAL_ORG` es opcional (nombre del ministerio). Mientras falten, la política muestra «pendiente de configurar» y el administrador ve un aviso en su Perfil. No hace falta NIT ni dirección.
- **Registro ante la SIC (RNBD):** según el Decreto 090 de 2018, solo deben inscribir sus bases de datos las sociedades y entidades sin ánimo de lucro con activos totales superiores a 100.000 UVT y las personas jurídicas públicas; **una persona natural no está obligada a inscribir**. Pero la Ley 1581 sí aplica (autorización, política, atender consultas y reclamos, seguridad). Si el responsable pasa a ser una entidad (por ejemplo, la iglesia constituida), debe revisar si supera ese umbral.
- **Revisión jurídica:** los textos son una base sencilla y razonable, pero no sustituyen asesoría; conviene que un abogado los revise antes del lanzamiento a unas 2000 personas, en especial quién figura como responsable (tú o la iglesia), la vinculación de menores y las finalidades.

## Actualizar una instalación existente
Cada fase nueva trae migraciones. El orden seguro es:
1. Publica primero el código nuevo (fusiona el pull request y espera el despliegue de Vercel).
2. Luego aplica las migraciones: `npx supabase db push`.

Notas por fase: la `20261019000001_people.sql` quita el correo de `profiles` y lo mueve a `profile_private`; la `20261020000001_announcements.sql` crea los anuncios (hasta aplicarla, el inicio muestra «No hay anuncios por ahora»); la `20261021000001_rotation.sql` crea la rotación, la planeación y el bucket privado `schedules` (hasta aplicarla, Mi servicio y Rotación no funcionan); la `20261022000001_chat.sql` crea la búsqueda y el límite diario del asistente; la `20261023000001_privacy.sql` crea la constancia de aceptación y la baja de cuenta (es aditiva: hasta aplicarla, la aplicación no pide aceptar los textos); la `20261025000001_support.sql` crea las ausencias, los apoyos y las solicitudes (aditiva; hasta aplicarla, Mi servicio funciona igual y simplemente no hay solicitudes); la `20261026000001_counts.sql` agrega la capacidad de las ubicaciones, las guías de conteo (bucket privado `counts`) y los totales (aditiva: hasta aplicarla, el menú Conteos no tiene datos); la `20261027000001_push.sql` crea los dispositivos de avisos, las preferencias y las funciones del servidor (aditiva); la `20261028000001_announcement_images.sql` crea las imágenes de las novedades y su bucket privado `announcements` (aditiva: hasta aplicarla, las novedades funcionan sin imágenes); la `20261024000001_minimal_data.sql` deja de guardar la foto de Google y borra las ya guardadas (publica primero el código nuevo, que ya no la pide, y luego aplica esta migración).

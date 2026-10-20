# LogiAI — Plan de la aplicación de logística

Aplicación de logística del equipo de El Lugar de Su Presencia. **Su objetivo principal es mostrar a cada servidor el manual de su servicio**: mapas, posiciones, indicaciones, fotos, videos, flujos y anuncios.

## 1. Stack

| Pieza | Tecnología |
|---|---|
| App web (UI + rutas de servidor) | Next.js (App Router, TypeScript, Tailwind) desplegado en **Vercel** (`*.vercel.app`) |
| Base de datos, login, archivos | **Supabase**: Postgres + RLS, Auth con Google, Storage |
| Chat IA | **OpenRouter**, modelo gratuito (ID configurable por variable de entorno) |
| Migraciones | Supabase CLI, versionadas en `supabase/migrations` |

No se usa Railway.

**Capacidad:** el plan gratis alcanza para 100 usuarios. Para la publicación a unas 2000 personas se recomienda Supabase Pro.

## 2. Roles y permisos

| Rol | Pertenece a un grupo | Ve | Gestiona |
|---|---|---|---|
| **Admin / desarrollador** (`hhherrerap@gmail.com`, también líder de sede) | No | Todo | Configuración técnica, catálogos, invitaciones a cualquier grupo |
| **Cabeza de ministerio** (`mreyes@supresencia.com`) | No | Todas las sedes y todos los grupos | Lo mismo que un líder de sede, pero en todas las sedes |
| **Líder de sede** (auditor, acompaña a los grupos) | No | Su sede completa: manual y todos sus grupos | Crea grupos, asigna **coordinadores y supervisores**, edita el manual de su sede, anuncios de su sede |
| **Coordinador** (máx. 2 por grupo) | Sí, uno solo | Manual de su sede + su grupo | Agrega **supervisores y voluntarios** a su grupo, carga la programación, planea posiciones (él no ocupa posiciones: coordina), novedades de su grupo |
| **Supervisor** (varios por grupo) | Sí, uno solo | Manual de su sede + su grupo | Planea y asigna posiciones del próximo servicio |
| **Voluntario** | Sí, uno solo | Manual de su sede + su grupo | — |

Reglas que hace cumplir la base de datos (no solo la interfaz):
- `memberships.user_id` es `UNIQUE`: una persona, un grupo.
- Un trigger limita a 2 los coordinadores por grupo.
- Los líderes de sede y la cabeza de ministerio no tienen membresía en ningún grupo.
- Un coordinador solo puede invitar o asignar el rol `supervisor` o `voluntario`, y solo en su grupo.
- El líder de sede solo actúa sobre grupos de su sede.

## 3. Login
- Login con Google mediante Supabase Auth.
- `invitations` funciona como lista blanca. El hook *Before User Created* de Supabase rechaza los correos que no estén invitados.
- Cada invitación ya trae el grupo y el rol, o el rol global (líder de sede, cabeza). En el primer login se crean el perfil y la membresía automáticamente.
- La carga inicial (seed) incluye `hhherrerap@gmail.com` como admin y líder de sede, y `mreyes@supresencia.com` como cabeza de ministerio.

## 4. Modelo de datos

### Organización
```
sites            id, slug, nombre                    castellana | nogal | suba | campestre
service_slots    site_id, día (mié|sáb|dom), franja (AM|PM|única), hora_llegada, hora_inicio, hora_fin
groups           service_slot_id, nombre             "Grupo 1 · Sábado PM · Castellana"
profiles         user_id, nombre, foto, is_admin, is_head          (el correo NO está aquí)
profile_private  user_id, email  ← privado: solo la persona y quien la administra (coordinador, líder de su sede, cabeza, admin)
site_leaders     user_id, site_id
memberships      user_id UNIQUE, group_id, rol (coordinador|supervisor|voluntario)
invitations      email UNIQUE, rol_global?, site_id?, group_id?, rol_grupo?, invitado_por, aceptada_en
```

### Manual
```
locations        site_id, parent_id?, tipo (auditorio|teatro|overflow|salón|exterior|otro), nombre, orden
maps             location_id, zone_id?, nombre, imagen (Storage), versión, activo
zones            location_id, nombre, tipo (orientación = exterior | acomodación = interior), orden
positions        zone_id, código, nombre, tipo (supervisor|voluntario), descripción, usa_radio,
                 aplica_dias[] (vacío = todos), aplica_franjas[] (vacío = todas), activa
position_markers position_id, map_id, top_pct, left_pct     (se arrastran en el editor)
position_media   position_id, tipo (foto|youtube|link), url o ruta en Storage, orden
flows            site_id, nombre, descripción     "Qué hacer cuando se llena el auditorio principal"
flow_steps       flow_id, orden, location_id, condición/disparador, instrucciones
```

Locations iniciales:
- **Castellana:** Auditorio principal (con el mapa actual y las zonas 1 a 6), Teatro, Overflow piso 4, Overflow piso 5, Salones.
- **Suba:** Auditorio principal, Overflow.
- **Campestre:** Auditorio principal, Salones.
- **Nogal:** Auditorio, Salón.

Todo es editable desde Administración. Los mapas se pueden subir, reemplazar y modificar. Los pines guardan su posición en porcentaje, así que se conservan al reemplazar una imagen con la misma proporción.

### Servicio, rotación y planeación
```
rotation_configs   service_slot_id, grupos_en_orden[], fecha_inicio, cada_n_semanas (=1)
service_cancellations  fecha, site_id? (null = todas las sedes), motivo     Navidad, Año Nuevo…
service_events     service_slot_id, fecha, group_id, estado (programado|cancelado), ajustado_a_mano
assignments        service_event_id, position_id, user_id, estado (borrador|publicado)
schedule_files     group_id, período, archivo PDF/imagen (Storage), texto_extraído, resumen
announcements      título, cuerpo, links[], alcance (sede|sede+día|grupo), site_id, día?, group_id?,
                   fijado, vigente_desde, vigente_hasta, autor
```

**Regla de rotación:** cada sede define el orden de los grupos de cada día y franja. El grupo de una fecha depende de cuántas semanas pasaron desde `fecha_inicio`, contadas en el ciclo de grupos. Si una fecha se cancela (Navidad, Año Nuevo), ese día no sirve nadie y **la rotación sigue normal**: la semana siguiente sirve el grupo que correspondía según el calendario. Ese turno se pierde y el orden no se corre.

El generador crea los `service_events` hasta una fecha límite. Al volver a generar, no toca las fechas marcadas como `ajustado_a_mano`.

**Planeación de posiciones:** para el próximo servicio de su grupo, coordinadores y supervisores ven la grilla de posiciones que aplican a ese día y franja y asignan personas. Una persona puede tener varias posiciones. Se puede copiar la asignación del servicio anterior y publicarla para que cada voluntario la vea en "Mi servicio".

## 5. Storage (Supabase)
| Bucket | Contenido |
|---|---|
| `maps` | `/{sede}/{location}/{mapa}-v{n}.png` |
| `position-media` | `/{sede}/{posición}/…` (solo fotos; los videos son links de YouTube) |
| `schedules` | `/{sede}/{grupo}/{período}.pdf` |
| `announcements` | Adjuntos de las novedades |

Las imágenes se comprimen en el navegador antes de subirlas. Los buckets son privados y se accede con URLs firmadas, con las mismas reglas de visibilidad por sede y grupo.

## 6. Pantallas
1. **Mi servicio:** próxima fecha, grupo, mis posiciones asignadas, novedades que me aplican.
2. **Manual:** sede → location → mapa → zona → pin. La ficha de cada posición muestra descripción, fotos, video, radio y ubicación en el mapa. Filtro por día y franja, que por defecto es el del usuario.
3. **Flujos:** qué hacer cuando se llena el auditorio principal, paso a paso, por sede.
4. **Novedades:** por sede, por sede y día, o por grupo, con links.
5. **Calendario y rotación:** fechas de servicio de mi grupo, cancelaciones y programación en PDF o imagen.
6. **Planeación:** para coordinadores y supervisores.
7. **Mi grupo:** miembros y roles.
8. **Administración:** invitaciones, grupos, locations, mapas, editor de pines, posiciones, flujos, rotación y cancelaciones.
9. **Chat IA.**
10. **Tema claro/oscuro**, conmutable y guardado por usuario.

### Paleta
| Color | Uso |
|---|---|
| `#0B0713` negro | Barra superior en modo claro, texto, fondo del modo oscuro |
| `#FFFFFF` blanco | Fondo del modo claro, texto del modo oscuro |
| `#FFD700` dorado | Acentos, ítem activo, insignias de rol, links en modo oscuro (en modo claro solo como relleno con texto oscuro) |
| `#6D28D9` / `#8B3DFF` morado brillante | Color principal: botones y links (más claro en modo oscuro) |
| `#2B0A55` / `#4C1D95` morado oscuro | Barra superior en modo oscuro y botones de cierre |
| `#C084FC` lila | Pin de voluntario |
| `#E11D48` rojo | Pin de supervisor y alertas |

## 7. Chat IA (OpenRouter, modelo gratuito)
- Ruta de servidor `/api/chat`. La clave de OpenRouter vive solo en Vercel. El modelo se define con `OPENROUTER_MODEL`.
- **No depende de herramientas (tool calling)**, porque los modelos gratuitos que rotan no lo soportan de forma confiable. En cada pregunta el servidor:
  1. Carga el contexto del usuario: sede, grupo, próxima fecha y posiciones asignadas.
  2. Busca con texto completo en español (Postgres `tsvector`) en posiciones, zonas, flujos, novedades y programaciones. La búsqueda corre **con la sesión del usuario**, así que RLS solo devuelve lo que esa persona puede ver.
  3. Envía al modelo un system prompt fijo y los fragmentos encontrados. El modelo **responde solo con lo cargado** y cita la fuente con un link.
- No se envían correos ni otros datos personales al modelo.
- Hay un límite diario de mensajes por usuario, porque los modelos gratuitos tienen cupo.
- Si la búsqueda se queda corta, se agregan embeddings con `gte-small` de Supabase y pgvector.
- Del PDF de programación se extrae el texto automáticamente. Para las imágenes, el coordinador agrega un resumen opcional.

## 8. Fases

**Estado:** ✅ Fase 1 · ✅ Fase 2 · ✅ Fase 3 · ✅ Fase 4 · ✅ Fase 5 · ✅ Fase 6 · ✅ Fase 7 · ✅ Fase 8 · ⬜ Fase 9

1. **Base:** proyecto Next.js, esquema y RLS, login con Google y hook de lista blanca, roles, tema claro/oscuro, carga inicial (sedes, locations, admin, cabeza), importación del prototipo actual (mapa y zonas 1 a 6 de Castellana, Auditorio principal).
2. **Manual (núcleo):** visor de mapas y pines, fichas de posición con fotos y YouTube, editor de pines, carga y reemplazo de mapas, posiciones por día y franja, flujos.
3. **Personas y grupos:** agregar correos con rol (coordinador a su grupo, líder a su sede, cabeza y administrador a cualquiera), horarios y grupos, mover/cambiar rol/eliminar de la aplicación, líderes de sede, "Mi grupo". **Los correos son privados** (solo la persona y quien la administra).
4. **Novedades:** noticias, cambios y avisos para toda la iglesia, una sede, una sede y un día, un día en todas las sedes, o un grupo; con enlaces, fijado, programación y vencimiento. Publican cabeza/admin (todo), líder (su sede) y coordinador (su grupo).
5. **Rotación y servicio:** rotación por horario y sede, cancelaciones que consumen el turno, servicios especiales, calendario, programación en PDF, Excel o imagen, planeación de posiciones con borrador y publicación, historial por persona.
6. **Chat IA:** búsqueda de texto completo en español bajo los permisos de la persona, modelo gratuito de OpenRouter (varios IDs con respaldo), enlaces a las fuentes, límite diario por persona.
7. **Reemplazos y apoyos:** ausencias, apoyos de personas de otros grupos (directos o por solicitud con postulación) para el próximo servicio del grupo. Detalle en 8.2.
8. **Conteos y totales:** guía de conteo (imagen) por sede y día de la semana, capacidad por ubicación, captura del total final por servicio y reporte semanal. Detalle en 8.3.
9. **Lanzamiento ampliado:** PWA instalable (con avisos al teléfono de las solicitudes de apoyo y de los conteos pendientes), ajustes, Supabase Pro, publicación a unas 2000 personas.

## 8.1 Protección de datos (Ley 1581 de 2012)
Aceptación obligatoria de la política de datos y los términos al primer ingreso (con constancia por versión), página Perfil (ver, rectificar, descargar y eliminar la cuenta) y política y términos públicos. Detalle en el README.

## 8.2 Fase 7 · Reemplazos y apoyos (hecha)
Cuando en un servicio planeado faltan personas, el grupo busca apoyo en otros grupos de su sede.

**Alcance:** solo el **próximo servicio** del grupo (la siguiente fecha programada, no cancelada).

**Ausencias**
- Las registran el **coordinador o supervisor** del grupo (y el líder de su sede). El voluntario no las marca en la aplicación; avisa a su coordinador.
- Al registrar la ausencia se le quitan sus posiciones de ese servicio, que quedan como vacantes en la planeación, y ya no se le puede asignar ese día. Se puede deshacer.

**Quién puede apoyar**
- Personas de la **misma sede**, de cualquier otro grupo u horario, con rol **voluntario o supervisor** (un supervisor puede cubrir posiciones de supervisor). Los coordinadores no apoyan, porque no ocupan posiciones.
- **Sin choque de horario:** no puede apoyar quien tenga su propio grupo sirviendo ese mismo día a una hora que se cruce. Lo hace cumplir la base de datos.

**Dos formas de sumar apoyos**
1. **Directa:** el coordinador o supervisor (o el líder) busca **por nombre** entre las personas de su sede que pueden apoyar. Ve solo nombre, grupo y rol, **nunca el correo**, y la agrega como apoyo de ese servicio.
2. **Solicitud de apoyo:** coordinador, supervisor o líder publica «necesitamos N personas», con nota y, si quiere, las posiciones que faltan («idealmente Puesto 5 y Puesto 12»).
   - **Quiénes la ven:** solo las personas que pueden apoyar, en una tarjeta en **Inicio** y con un contador en **Mi servicio**.
   - **Postulación:** quien puede apoyar se postula y el coordinador o supervisor del grupo que pide **aprueba o rechaza**.
   - **Cierre:** la solicitud se cierra sola al llenarse las vacantes o al pasar la fecha. Se reabre si un apoyo se retira.

**Después de aprobado**
- El apoyo cuenta como integrante del servicio solo ese día. Se le puede asignar una posición, ve la planeación publicada de ese servicio y la fecha aparece en su **Mi servicio** y en su **historial**, con la etiqueta «apoyo a Grupo X».
- Puede **retirarse él mismo hasta el día anterior**; después debe avisar a su coordinador.
- El **coordinador de su grupo de origen** se entera (ve qué personas de su grupo apoyan a otros y cuándo), pero no tiene que aprobar.

**Avisos:** dentro de la aplicación en esta fase. Las notificaciones al teléfono llegan en la fase 8, con la PWA.

## 8.3 Fase 8 · Conteos y totales (hecha)
Los grupos cuentan a las personas que entran por cada entrada de la sede; al terminar el servicio, el coordinador o un supervisor registra cuántas entraron en cada ubicación y la aplicación lo contrasta con la capacidad.

**Capacidad (previa)**
- Cada ubicación de la sede (auditorio, teatro, overflow, salones…) tiene un **total de sillas**: una sola cifra, igual para todos los servicios. La registra el **líder de la sede** o el **administrador** (junto a los datos de la ubicación, en el Manual).

**Guía de conteo (imagen)**
- El **líder** (de su sede) o el **administrador** cargan una **imagen** que indica cómo y dónde contar en cada entrada. Es **por sede y por día de la semana** (miércoles, sábado o domingo) y **se repite cada semana** hasta que se reemplace o se quite. Aplica a todos los horarios de ese día.
- La ven el grupo que sirve ese día en la página de su servicio, y el líder, la cabeza y el administrador. **Las entradas no se registran**: la imagen es la que dice qué contar en cada una.

**Captura del total**
- Al terminar el servicio, el **coordinador o un supervisor del grupo que sirvió** ingresa **un total final por ubicación** (no hay varios momentos ni división por edades).
- **Validación:** el total no puede superar la capacidad de la ubicación; la base de datos lo rechaza. Se muestra la capacidad y el porcentaje de ocupación. Solo se captura desde el día del servicio.
- **Plazo:** quien captura puede editar hasta **24 horas después** del servicio; pasado ese plazo **solo corrige el líder** de la sede (o el administrador), y queda registrado quién cambió qué y cuándo.
- Si falta capturar, aparece un **recordatorio en Mi servicio** (los avisos al teléfono llegan con la PWA).

**Reporte (solo en pantalla, sin descargas)**
- Por **servicio**, por **día** (todos sus horarios) y por **semana completa de lunes a domingo**, con el total por ubicación, el total de la sede, la capacidad y el porcentaje de ocupación, y una comparación sencilla con la semana anterior.
- **Quién lo ve:** el líder de su sede, la cabeza y el administrador (todas las sedes, con totales consolidados). Los coordinadores y supervisores ven **solo los conteos de sus servicios**.
- Todas las reglas las hace cumplir la base de datos, no solo la pantalla.

## 9. Lo que se necesita crear (cuenta del ministerio o del admin)
1. Proyecto en Supabase. Se toman las variables `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY`.
2. Cliente OAuth en Google Cloud (pantalla de consentimiento y redirect URI de Supabase), configurado en Supabase → Auth → Google.
3. Proyecto en Vercel conectado a este repositorio, con las variables de entorno.
4. Clave de OpenRouter (`OPENROUTER_API_KEY`), necesaria recién en la fase 5.

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
| **Coordinador** (máx. 2 por grupo) | Sí, uno solo | Manual de su sede + su grupo | Agrega **supervisores y voluntarios** a su grupo, carga la programación, planea posiciones, anuncios de su grupo |
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
profiles         user_id, nombre, foto, email, rol_global (admin|cabeza|lider_sede|miembro)
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
| `announcements` | Adjuntos de los anuncios |

Las imágenes se comprimen en el navegador antes de subirlas. Los buckets son privados y se accede con URLs firmadas, con las mismas reglas de visibilidad por sede y grupo.

## 6. Pantallas
1. **Mi servicio:** próxima fecha, grupo, mis posiciones asignadas, anuncios que me aplican.
2. **Manual:** sede → location → mapa → zona → pin. La ficha de cada posición muestra descripción, fotos, video, radio y ubicación en el mapa. Filtro por día y franja, que por defecto es el del usuario.
3. **Flujos:** qué hacer cuando se llena el auditorio principal, paso a paso, por sede.
4. **Anuncios:** por sede, por sede y día, o por grupo, con links.
5. **Calendario y rotación:** fechas de servicio de mi grupo, cancelaciones y programación en PDF o imagen.
6. **Planeación:** para coordinadores y supervisores.
7. **Mi grupo:** miembros y roles.
8. **Administración:** invitaciones, grupos, locations, mapas, editor de pines, posiciones, flujos, rotación y cancelaciones.
9. **Chat IA.**
10. **Tema claro/oscuro**, conmutable y guardado por usuario.

### Paleta
| Color | Uso |
|---|---|
| `#800080` púrpura | Color principal: barra, botones |
| `#FFD700` dorado | Acentos, ítem activo (en modo claro solo como relleno con texto oscuro) |
| `#800020` vinotinto | Superficies y encabezados en modo oscuro |
| `#FF0000` rojo | Pin de supervisor, alertas |
| `#00BFFF` celeste | Pin de voluntario, links (en modo claro, como relleno) |
| `#CD7F32` bronce | Insignias de coordinador y líder |
| `#FFFFFF` blanco | Fondo del modo claro, texto del modo oscuro |

## 7. Chat IA (OpenRouter, modelo gratuito)
- Ruta de servidor `/api/chat`. La clave de OpenRouter vive solo en Vercel. El modelo se define con `OPENROUTER_MODEL`.
- **No depende de herramientas (tool calling)**, porque los modelos gratuitos que rotan no lo soportan de forma confiable. En cada pregunta el servidor:
  1. Carga el contexto del usuario: sede, grupo, próxima fecha y posiciones asignadas.
  2. Busca con texto completo en español (Postgres `tsvector`) en posiciones, zonas, flujos, anuncios y programaciones. La búsqueda corre **con la sesión del usuario**, así que RLS solo devuelve lo que esa persona puede ver.
  3. Envía al modelo un system prompt fijo y los fragmentos encontrados. El modelo **responde solo con lo cargado** y cita la fuente con un link.
- No se envían correos ni otros datos personales al modelo.
- Hay un límite diario de mensajes por usuario, porque los modelos gratuitos tienen cupo.
- Si la búsqueda se queda corta, se agregan embeddings con `gte-small` de Supabase y pgvector.
- Del PDF de programación se extrae el texto automáticamente. Para las imágenes, el coordinador agrega un resumen opcional.

## 8. Fases

**Estado:** ✅ Fase 1 · ✅ Fase 2 · ⬜ Fase 3 · ⬜ Fase 4 · ⬜ Fase 5 · ⬜ Fase 6
1. **Base:** proyecto Next.js, esquema y RLS, login con Google y hook de lista blanca, roles, tema claro/oscuro, carga inicial (sedes, locations, admin, cabeza), importación del prototipo actual (mapa y zonas 1 a 6 de Castellana, Auditorio principal).
2. **Manual (núcleo):** visor de mapas y pines, fichas de posición con fotos y YouTube, editor de pines, carga y reemplazo de mapas, posiciones por día y franja, flujos. Con esto se lanza a unos 100 coordinadores y supervisores.
3. **Anuncios.**
4. **Grupos y servicio:** invitaciones por rol, rotación y cancelaciones, calendario, programación en PDF o imagen, planeación de posiciones.
5. **Chat IA.**
6. **Lanzamiento ampliado:** PWA instalable, ajustes, Supabase Pro, publicación a unas 2000 personas.

## 9. Lo que se necesita crear (cuenta del ministerio o del admin)
1. Proyecto en Supabase. Se toman las variables `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY`.
2. Cliente OAuth en Google Cloud (pantalla de consentimiento y redirect URI de Supabase), configurado en Supabase → Auth → Google.
3. Proyecto en Vercel conectado a este repositorio, con las variables de entorno.
4. Clave de OpenRouter (`OPENROUTER_API_KEY`), necesaria recién en la fase 5.

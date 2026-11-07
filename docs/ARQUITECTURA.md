# Arquitectura

LogiAI es una aplicación web instalable (PWA) para el manual de logística y el servicio de **El Lugar de Su Presencia**. Esta página describe cómo está armada. Para los datos que se mueven, ver [`FLUJO-DE-DATOS.md`](FLUJO-DE-DATOS.md); para las protecciones, [`SEGURIDAD.md`](SEGURIDAD.md); para la puesta en marcha, el [`README`](../README.md); para el plan y las decisiones, [`PLAN.md`](../PLAN.md).

## Vista general

```mermaid
flowchart LR
  U[Navegador / celular<br/>PWA + service worker] -->|HTTPS| V[Next.js 16 en Vercel<br/>páginas, rutas /api, proxy.ts]
  V -->|sesión de la persona<br/>(cookies, RLS)| S[(Supabase<br/>Postgres + Auth + Storage)]
  U -->|cliente del navegador<br/>clave pública + sesión| S
  V -->|solo servidor, service_role| S
  V -->|pregunta + fragmentos| O[OpenRouter<br/>modelos de IA]
  V -->|Web Push| P[Servicios push del navegador]
  C[Vercel Cron] -->|CRON_SECRET| V
  G[Google OAuth] --> S
```

| Capa | Tecnología | Responsabilidad |
|---|---|---|
| Interfaz | Next.js 16 (App Router), React, Tailwind v4 | Pantallas, formularios, contador sin conexión |
| Servidor | Server Components, rutas `app/api/*`, `proxy.ts` | Sesión, carga de datos, chat, avisos, tarea programada |
| Datos | Supabase: Postgres, Auth (Google), Storage | Fuente de verdad **y de los permisos** (RLS, funciones SQL) |
| Hosting | Vercel (`vercel.json` define la tarea programada) | Despliegue y cron |
| IA | OpenRouter (modelos gratuitos, configurables) | Respuestas del asistente |

> Next.js 16 tiene cambios de API respecto de versiones anteriores (parámetros asíncronos, `proxy.ts` en lugar de `middleware`, `after()`). Antes de escribir código, lee la guía en `node_modules/next/dist/docs/` (ver `AGENTS.md`).

## Estructura del repositorio

| Ruta | Contenido |
|---|---|
| `app/` | Rutas. `(app)/` agrupa las pantallas con sesión: Inicio, `manual`, `novedades`, `personas`, `grupo`, `servicio`, `conteos`, `contador`, `asistente`, `perfil`. Públicas: `login`, `auth`, `politica`, `terminos`, `offline`. API: `api/chat`, `api/support`, `api/push`, `api/cron` |
| `components/` | Interfaz por tema (`manual`, `counts`, `counter`, `service`, `reservations`, `people`, `chat`, …) |
| `lib/` | Lógica por tema. Cada tema suele tener `types`, `load` (lecturas), `mutations` (escrituras) y módulos **puros** con pruebas (`lib/counts/{balance,quotas,report}`, `lib/counter/queue`, `lib/service/meetings`) |
| `lib/supabase/` | `server.ts` (sesión de la persona), `client.ts` (navegador), `admin.ts` (service_role, solo servidor), `env.ts` |
| `proxy.ts` | Refresca la sesión y manda a `/login` a quien no la tenga (comprobación optimista) |
| `public/sw.js` | Service worker: avisos push y pantalla «sin conexión» |
| `supabase/migrations/` | Esquema, RLS, funciones y datos iniciales, en orden cronológico (un archivo por entrega) |
| `supabase/tests/` | Pruebas de permisos sobre Postgres en WASM (PGlite) |
| `legacy/` | Prototipo original e imágenes de mapas de Castellana |
| `scripts/` | Carga inicial y generación de iconos |

## Principio central: la base de datos decide

La aplicación **no repite** las reglas de permisos en el código de la interfaz de forma que se puedan saltar: la interfaz oculta lo que no corresponde (comodidad), pero quien manda es Postgres.

- Cada tabla tiene **RLS** activo. Las políticas usan funciones auxiliares (`is_admin`, `is_site_leader`, `can_manage_site`, `can_plan_event`, `can_count_event`, `can_use_entrance_counter`, `can_view_*`…).
- Las operaciones con varias reglas (guardar conteos, reservas, cupos; pedir y aceptar apoyos; el contador) son **funciones SQL `SECURITY DEFINER`** que validan quién llama y la ventana de tiempo, y guardan todo o nada.
- El código de `lib/*/mutations.ts` solo llama a la tabla o a la función con la sesión de la persona y traduce los errores a mensajes en español.

## Roles y alcance

Administrador · Cabeza · Líder de sede · Coordinador / Supervisor / Voluntario de un grupo · rol adicional «Reservas». El acceso es **por invitación** (tabla `invitations`): sin invitación no se crea la cuenta. El detalle de qué puede cada rol está en el README (por tema) y se aplica en RLS.

## Dominios funcionales

| Dominio | Qué hace | Piezas principales |
|---|---|---|
| Manual | Mapas, zonas (con **detalle** de ingreso/evacuación), posiciones, fotos, videos, flujos | `lib/manual`, `components/manual`, buckets `maps` y `position-media` |
| Personas y grupos | Invitaciones, membresías, horarios y grupos | `lib/people`, `app/(app)/personas`, `grupo` |
| Novedades | Anuncios con imágenes y vigencia | `lib/announcements`, bucket `announcements` |
| Rotación y servicio | Servicios generados por horario, planeación publicada, asignaciones, reemplazos y apoyos | `lib/service`, `app/(app)/servicio`, bucket `schedules` |
| Reuniones | Reuniones por horario (estándar) y personalizables por servicio | `slot_meetings`, `event_meetings`, `lib/service/meetings.ts` |
| Entradas y conteos | Entradas por ubicación con cupo por reunión, reservas, cuadre del aforo, totales, reportes | `lib/counts`, `components/counts`, bucket `counts` |
| Contador digital | Contador en pantalla completa con cola sin conexión | `lib/counter`, `components/counter`, `entrance_counters`, `entrance_count_ops` |
| Asistente | Chat con búsqueda en español sobre lo que la persona puede ver | `app/api/chat`, `lib/chat`, función `search_manual` |
| Avisos al teléfono | Web Push y recordatorios | `lib/push`, `public/sw.js`, `app/api/cron` |
| Privacidad | Aceptación de la política, descarga y baja de cuenta | `lib/legal`, `lib/profile`, `app/aceptar` |

## Decisiones de diseño que conviene recordar

- **Sin caché de datos en el navegador:** el service worker solo guarda la pantalla «sin conexión»; todo lo demás viene de la red porque es privado y cambia.
- **Contador sin conexión:** los toques se guardan en el teléfono con un identificador único y se reenvían; el servidor es idempotente (`entrance_count_ops`) y nunca deja bajar de cero ni pasar del cupo o del aforo.
- **Reuniones y «todo el servicio»:** un servicio puede no tener reuniones; en ese caso los conteos usan la reunión nula (UUID de ceros en las funciones, columna `meeting_key` en las llaves).
- **El asistente no usa herramientas** (los modelos gratuitos que rotan no las soportan de forma fiable): el servidor busca primero y le pasa al modelo solo los fragmentos.
- **Migraciones aditivas:** cada una termina revocando a `public/anon/authenticated` la ejecución de las funciones y concediéndola solo a quien corresponde (ver `SEGURIDAD.md`).

## Pruebas

| Nivel | Comando | Cubre |
|---|---|---|
| Unitarias (tsx) | `npm run test:unit` | Lógica pura de `lib/` |
| Base de datos | `npm run test:db` | RLS, funciones SQL y endurecimiento de permisos sobre PGlite |
| Tipos y estilo | `npm run typecheck`, `npm run lint` | |
| Construcción | `npm run build` | |

Las pruebas de extremo a extremo (navegador contra Postgres real) se corrieron fuera del repositorio y no forman parte de CI; si se necesitan de forma permanente, conviene versionarlas.

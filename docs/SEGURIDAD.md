# Seguridad

Modelo de amenazas sencillo: la aplicación guarda datos de personas (nombre, correo, servicio en una iglesia → dato sensible) y datos de operación. Lo que más importa es que **cada persona vea y cambie solo lo que le corresponde**, que **no se creen cuentas sin invitación** y que **las claves poderosas nunca lleguen al navegador**. Ver también [`ARQUITECTURA.md`](ARQUITECTURA.md) y [`FLUJO-DE-DATOS.md`](FLUJO-DE-DATOS.md).

## 1. Identidad y acceso

- **Login solo con Google** vía Supabase Auth. **Acceso por invitación**: el hook `hook_before_user_created` rechaza con mensaje claro y el trigger `on_auth_user_created` lo impide aunque el hook no esté activo.
- `proxy.ts` refresca la sesión y redirige a `/login`. Es una comprobación **optimista**: no es la barrera real.
- `getCurrentUser()` (React `cache`) calcula rol, sedes y aceptación de la política; las pantallas y rutas `/api` lo usan para negar antes de trabajar.
- Sin aceptar la política y los términos no se entra a nada (ni al asistente ni a `/api/*`: devuelven 403).

## 2. Autorización: la base de datos manda

- **RLS activa en todas las tablas**, con políticas basadas en funciones auxiliares (`is_admin`, `is_site_leader`, `can_manage_site`, `can_plan_event`, `can_count_event`, `can_use_entrance_counter`, `can_view_profile`, …).
- El código usa **la sesión de la persona** (clave pública + cookies). Así un error en la interfaz no abre datos: Postgres vuelve a filtrar.
- Operaciones con reglas = **funciones `SECURITY DEFINER`** con `search_path` fijo, que:
  - comprueban quién llama (`auth.uid()`) y su alcance (sede/grupo/rol),
  - aplican ventanas de tiempo (conteos: desde el día del servicio hasta el final del día siguiente; contador: solo el día del servicio),
  - validan topes (cupo, aforo, rangos), toman bloqueos por servicio/reunión/lugar para evitar carreras y guardan **todo o nada**.
- Reglas de escala para evitar abuso: máximos de entradas por ubicación, reuniones por horario, archivos por servicio, largos de texto (`check`: detalle de zona ≤ 5000, zonas de entrada ≤ 300, nota ≤ 200).

### Permisos de ejecución de funciones
Cada migración termina con un bloque que:
1. revoca `execute` a `public`, `anon` y `authenticated` de **todas** las funciones de `public`;
2. concede `execute` a `authenticated` y `service_role` solo a las que no son *triggers*;
3. vuelve a revocar a `authenticated` las **funciones de uso exclusivo del servidor** (`support_request_audience`, `pending_counts_audience`, `claim_notification`).

Una prueba de endurecimiento (`supabase/tests/rls.test.mjs`) falla si una migración vuelve a abrir esas funciones. **Toda migración nueva debe incluir ese bloque.**

## 3. Secretos y claves

| Secreto | Dónde vive | Reglas |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_*` | navegador y servidor | Solo clave pública; el acceso real lo limita RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | solo servidor (Vercel) | Se salta RLS. Solo en `lib/supabase/admin.ts`, nunca con `NEXT_PUBLIC_`, nunca en un componente de cliente, y siempre **después** de comprobar quién llama |
| `OPENROUTER_API_KEY` | solo servidor | No se envía al navegador |
| `VAPID_PRIVATE_KEY` | solo servidor | La pública sí va al navegador |
| `CRON_SECRET` | solo servidor | Protege `/api/cron/*`; si falta, la ruta responde 503 |

- Nada de esto se guarda en el repositorio (`.env.local` fuera de git; `.env.example` solo con nombres y comentarios).
- Las compilaciones de producción se han revisado para que no incluyan valores de claves en el código enviado al navegador.
- Si una clave se expone: rotarla en el proveedor y en Vercel, y redesplegar.

## 4. Archivos (Storage)

Todos los buckets son **privados** con límite de tamaño y tipos permitidos:

| Bucket | Contenido | Límite | Tipos |
|---|---|---|---|
| `maps` | Mapas | 10 MB | png, jpeg, webp |
| `position-media` | Fotos de posiciones | 5 MB | jpeg, png, webp |
| `announcements` | Imágenes de novedades | 1 MB | png, jpeg, webp |
| `counts` | Guías de conteo | 10 MB | png, jpeg, webp |
| `schedules` | Archivos de programación | 10 MB | los definidos en la migración |

Políticas de Storage replican los permisos por sede; la lectura se hace con **enlaces firmados** que vencen en 1 hora. Las imágenes se reducen y convierten en el navegador (`lib/image.ts`) antes de subirse.

## 5. Asistente de IA

- La búsqueda corre **con la sesión de la persona**: solo encuentra lo que RLS le deja ver (una voluntaria de una sede nunca recibe contenido de otra). Esto incluye el detalle de zonas y las entradas.
- **No se envían correos ni nombres** al modelo; solo rol, sede, grupo, próximo servicio y posiciones.
- Defensa contra inyección de instrucciones: el contenido de novedades y detalles se entrega **como datos** con la orden de no obedecer instrucciones escritas dentro. No hay herramientas ni acciones: el modelo no puede escribir en la base de datos ni leer más de lo que se le pasó.
- Los enlaces de las fuentes los arma el servidor, no el modelo.
- Límite diario por persona (`chat_consume`, `CHAT_DAILY_LIMIT`, hora de Colombia) y entradas acotadas (largo de pregunta, historial limpiado).
- Aviso honesto: el texto de la pregunta y los fragmentos viajan a un proveedor externo (OpenRouter y el modelo elegido). Esto está declarado en la política de datos.

## 6. Rutas de servidor

| Ruta | Protección |
|---|---|
| `/api/chat` | Sesión + aceptación + límite diario + validación de entrada |
| `/api/support/request` | Sesión + aceptación; valida UUID y tipos; la regla real la aplica `create_support_request` con la sesión; avisos con `after()` |
| `/api/push/test` | Sesión; solo envía a la propia persona |
| `/api/cron/pending-counts` | `CRON_SECRET` (cabecera `Authorization: Bearer`, comparada en tiempo constante); usa `service_role` solo tras validarlo |

## 7. Navegador y PWA

- El service worker **no cachea datos**, solo la pantalla `/offline` y un icono; `sw.js` se sirve sin caché para que las actualizaciones lleguen.
- El contador guarda en `localStorage` solo las operaciones pendientes (identificador, entrada, reunión, delta); se borran al enviarse.
- No hay `dangerouslySetInnerHTML` con contenido de usuarios; los enlaces en novedades pasan por `linkify`/`ExternalLink` (solo `http/https`, `rel` seguro).
- **Pendiente recomendable:** cabeceras de seguridad (CSP, `X-Content-Type-Options`, `Referrer-Policy`, `frame-ancestors`) en `next.config.ts`; hoy solo se definen las del service worker.

## 8. Protección de datos personales (Colombia)

Ley 1581 de 2012 y Decreto 1377 de 2013: autorización previa y expresa (incluye datos sensibles y transmisión a proveedores en el exterior), constancia con versión y fecha (`POLICY_VERSION`), datos mínimos, descarga y supresión de la cuenta, textos públicos en `/politica` y `/terminos`. Detalle y pendientes (registro ante la SIC, revisión jurídica) en el README.

## 9. Auditoría y trazabilidad

- Totales de conteo: registro de quién/cuándo/valor anterior y nuevo (tabla `service_count_log`, función `count_log`).
- Contador digital: cada envío en `entrance_count_ops` (quién, cuándo, pedido y aplicado).
- Constancia de aceptación de la política: solo la ve la propia persona.
- Los totales no son datos personales; si la persona se elimina, se conservan sin su nombre.

## 10. Operación y hábitos

- Migraciones aditivas, aplicadas en orden (`npx supabase db push`); revisar el bloque de permisos al final de cada una.
- Correr `npm test` (unitarias + RLS) antes de cada entrega; el PR lo revisa y fusiona una persona.
- Producción ampliada (~2000 personas): Supabase Pro (respaldos), consentimiento de Google fuera de «Testing», revisión jurídica de los textos.
- Reporte de un problema de seguridad: avisar de inmediato al administrador de la aplicación (`LEGAL_EMAIL`); no publicarlo en el repositorio.

## Revisión periódica sugerida

- [ ] ¿Alguna tabla nueva sin RLS? (`select relname from pg_class where relkind='r' and not relrowsecurity` en el esquema `public`)
- [ ] ¿Alguna función nueva ejecutable por `anon`?
- [ ] ¿Algún secreto con prefijo `NEXT_PUBLIC_`?
- [ ] ¿Cambió algún proveedor que reciba datos (IA, push)? Actualizar la política y subir `POLICY_VERSION`.

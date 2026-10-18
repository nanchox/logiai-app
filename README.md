# LogiAI

Manual de logística y servicio de **El Lugar de Su Presencia**: mapas, posiciones, indicaciones, novedades y chat con IA.
El plan completo está en [`PLAN.md`](PLAN.md). Estado actual: **Fases 1 a 5** completas (base, login, permisos, manual con mapas y posiciones, fotos, videos, flujos, personas y grupos, novedades, y rotación y servicio). Sigue el chat de IA.

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

## Actualizar una instalación existente
Cada fase nueva trae migraciones. El orden seguro es:
1. Publica primero el código nuevo (fusiona el pull request y espera el despliegue de Vercel).
2. Luego aplica las migraciones: `npx supabase db push`.

Notas por fase: la `20261019000001_people.sql` quita el correo de `profiles` y lo mueve a `profile_private`; la `20261020000001_announcements.sql` crea los anuncios (hasta aplicarla, el inicio muestra «No hay anuncios por ahora»); la `20261021000001_rotation.sql` crea la rotación, la planeación y el bucket privado `schedules` (hasta aplicarla, Mi servicio y Rotación no funcionan).

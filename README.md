# LogiAI

Manual de logística y servicio de **El Lugar de Su Presencia**: mapas, posiciones, indicaciones, anuncios y chat con IA.
El plan completo está en [`PLAN.md`](PLAN.md). Estado actual: **Fases 1, 2 y 3** completas (base, login, permisos, manual con mapas y posiciones, fotos, videos, flujos, y personas y grupos). Siguen anuncios, rotación y calendario, y el chat de IA.

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

## Actualizar una instalación existente
La migración `20261019000001_people.sql` quita el correo de `profiles` y lo mueve a `profile_private`. Para no dejar la aplicación publicada sin poder leer el perfil, el orden es:
1. Publica primero el código nuevo (fusiona el pull request y espera el despliegue de Vercel).
2. Luego aplica las migraciones: `npx supabase db push`.

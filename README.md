# LogiAI

Manual de logística y servicio de **El Lugar de Su Presencia**: mapas, posiciones, indicaciones, anuncios y chat con IA.
El plan completo está en [`PLAN.md`](PLAN.md). Estado actual: **Fases 1 y 2** completas (base, login, permisos, manual con mapas, posiciones, fotos, videos y flujos). Siguen anuncios, grupos y rotación, y el chat de IA.

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

## Acceso y roles
Nadie crea cuenta sin una fila en `invitations`. La migración 5 deja invitados al administrador y a la cabeza de ministerio;
los demás se agregan desde la app (fase 4) o, mientras tanto, con SQL:
```sql
insert into invitations (email, group_id, group_role) values ('persona@correo.com', '<id del grupo>', 'voluntario');
```
Los roles globales (`is_admin`, `is_head`) solo se cambian con SQL o `service_role`; ningún usuario puede dárselos desde la app.

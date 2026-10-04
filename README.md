# LogiAI

Manual de logística y servicio de **El Lugar de Su Presencia**: mapas, posiciones, indicaciones, anuncios y chat con IA.
El plan completo está en [`PLAN.md`](PLAN.md). Estado actual: **Fase 1** (base, login, permisos, importación del prototipo).

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
   (o pega cada archivo de `supabase/migrations/` en *SQL Editor*, del 1 al 5).
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
npm run typecheck && npm run lint && npm run test:db
```

## Acceso y roles
Nadie crea cuenta sin una fila en `invitations`. La migración 5 deja invitados al administrador y a la cabeza de ministerio;
los demás se agregan desde la app (fase 4) o, mientras tanto, con SQL:
```sql
insert into invitations (email, group_id, group_role) values ('persona@correo.com', '<id del grupo>', 'voluntario');
```
Los roles globales (`is_admin`, `is_head`) solo se cambian con SQL o `service_role`; ningún usuario puede dárselos desde la app.

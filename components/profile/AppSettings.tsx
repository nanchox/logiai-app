"use client";

import { useEffect, useMemo, useState } from "react";
import { btn, btnPrimary, ErrorText } from "@/components/manual/ui";
import { createClient } from "@/lib/supabase/client";
import { disablePush, enablePush, isIos, isStandalone, loadPrefs, type Prefs, pushSupported, savePrefs, thisDevice } from "@/lib/push/client";

type BeforeInstall = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

/** Instalar la aplicación en la pantalla de inicio. */
export function InstallApp() {
  const [event, setEvent] = useState<BeforeInstall | null>(null);
  const [installed, setInstalled] = useState(false);
  const [ios, setIos] = useState(false);
  useEffect(() => {
    // Se lee el navegador después del primer dibujo (en el servidor no existe).
    void Promise.resolve().then(() => { setInstalled(isStandalone()); setIos(isIos()); });
    const on = (e: Event) => { e.preventDefault(); setEvent(e as BeforeInstall); };
    const done = () => { setInstalled(true); setEvent(null); };
    window.addEventListener("beforeinstallprompt", on);
    window.addEventListener("appinstalled", done);
    return () => { window.removeEventListener("beforeinstallprompt", on); window.removeEventListener("appinstalled", done); };
  }, []);

  if (installed) return <p className="text-sm">✓ LogiAI ya está instalada en este dispositivo.</p>;
  if (event) return <button type="button" className={btnPrimary} onClick={async () => { await event.prompt(); await event.userChoice; setEvent(null); }}>Instalar la aplicación</button>;
  return (
    <p className="text-sm text-muted">
      {ios
        ? <>En iPhone o iPad: toca <strong>Compartir</strong> y luego <strong>Agregar a pantalla de inicio</strong>.</>
        : <>Desde el menú de tu navegador elige <strong>Instalar aplicación</strong> o <strong>Agregar a la pantalla de inicio</strong>.</>}
      {" "}Se abre como una aplicación, sin la barra del navegador.
    </p>
  );
}

/** Avisos al teléfono: activar este dispositivo, elegir qué avisos y probarlos. */
export function PushSettings({ vapidKey, userId, isPlanner }: { vapidKey: string; userId: string; isPlanner: boolean }) {
  const sb = useMemo(() => createClient(), []);
  const [ready, setReady] = useState(false);
  const [supported, setSupported] = useState(true);
  const [on, setOn] = useState(false);
  const [denied, setDenied] = useState(false);
  const [prefs, setPrefs] = useState<Prefs>({ supportRequests: true, pendingCounts: true });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setSupported(pushSupported());
      if (pushSupported()) {
        setDenied(Notification.permission === "denied");
        const sub = await thisDevice().catch(() => null);
        // La suscripción del navegador solo cuenta si también está registrada en la cuenta de quien está en sesión.
        if (sub) {
          const { data } = await sb.from("push_subscriptions").select("id").eq("endpoint", sub.endpoint).maybeSingle();
          setOn(!!data);
        }
        setPrefs(await loadPrefs(sb, userId));
      }
      setReady(true);
    })();
  }, [sb, userId]);

  const run = async (fn: () => Promise<string | void>) => {
    setBusy(true); setError(null); setInfo(null);
    try { setInfo((await fn()) ?? null); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  if (!vapidKey) return <p className="text-sm text-muted">Los avisos al teléfono todavía no están disponibles: el administrador debe configurarlos.</p>;
  if (!ready) return <p className="text-sm text-muted">Revisando los avisos…</p>;
  if (!supported) {
    return <p className="text-sm text-muted">{isIos() && !isStandalone() ? "En iPhone, primero instala la aplicación en la pantalla de inicio (arriba) y ábrela desde ahí: así podrás activar los avisos." : "Este navegador no admite avisos."}</p>;
  }

  // El cambio se ve al instante y, si no se pudo guardar, se devuelve a como estaba.
  const setPref = (patch: Partial<Prefs>) => {
    const before = prefs;
    const next = { ...prefs, ...patch };
    setPrefs(next);
    void run(async () => { try { await savePrefs(sb, userId, next); } catch (e) { setPrefs(before); throw e; } });
  };
  return (
    <div className="space-y-3">
      {denied && <p className="text-sm text-danger">Bloqueaste los avisos en este navegador. Actívalos en la configuración del sitio (el candado junto a la dirección) y vuelve a intentar.</p>}
      <div className="flex flex-wrap items-center gap-3">
        {on
          ? <button type="button" className={btn} disabled={busy} onClick={() => run(async () => { await disablePush(sb); setOn(false); return "Avisos desactivados en este dispositivo."; })}>Desactivar en este dispositivo</button>
          : <button type="button" className={btnPrimary} disabled={busy} onClick={() => run(async () => { await enablePush(sb, vapidKey); setOn(true); setDenied(false); return "Avisos activados en este dispositivo."; })}>Activar avisos en este dispositivo</button>}
        {on && <button type="button" className={btn} disabled={busy} onClick={() => run(async () => {
          const res = await fetch("/api/push/test", { method: "POST" });
          const data = (await res.json().catch(() => ({}))) as { sent?: number; error?: string };
          if (!res.ok) throw new Error(data.error ?? "No se pudo enviar el aviso de prueba.");
          return `Aviso de prueba enviado a ${data.sent} ${data.sent === 1 ? "dispositivo" : "dispositivos"}.`;
        })}>Enviar aviso de prueba</button>}
      </div>
      {on && (
        <fieldset className="space-y-2" disabled={busy}>
          <legend className="text-xs font-bold uppercase tracking-wider text-muted">Qué avisos quiero recibir</legend>
          <label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-0.5 h-5 w-5 accent-[var(--primary)]" checked={prefs.supportRequests} onChange={(e) => setPref({ supportRequests: e.target.checked })} />
            <span><strong>Solicitudes de apoyo</strong> de otros grupos de mi sede</span></label>
          {isPlanner && (
            <label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-0.5 h-5 w-5 accent-[var(--primary)]" checked={prefs.pendingCounts} onChange={(e) => setPref({ pendingCounts: e.target.checked })} />
              <span><strong>Conteos pendientes</strong> de los servicios de mi grupo</span></label>
          )}
        </fieldset>
      )}
      <ErrorText error={error} />
      {info && <p role="status" className="rounded-lg border border-primary/50 bg-primary/10 p-2 text-sm">{info}</p>}
      <p className="text-xs text-muted">Los avisos solo dicen que hay algo por hacer; no incluyen nombres ni datos personales. Puedes desactivarlos cuando quieras.</p>
    </div>
  );
}

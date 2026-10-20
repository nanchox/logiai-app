"use client";

import { useEffect } from "react";

/** Registra el service worker (avisos al teléfono y pantalla sin conexión). */
export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !window.isSecureContext) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
  }, []);
  return null;
}

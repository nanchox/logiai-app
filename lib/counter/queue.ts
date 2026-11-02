// Cola de toques del contador: el conteo se muestra al instante y se envía al servidor cuando hay señal. Funciones puras: sin red ni navegador.
/** `tried`: ya se intentó enviar; su identificador no se reutiliza para otra cantidad (el servidor ignora los repetidos). */
export type PendingOp = { id: string; delta: number; tried?: boolean };

/** Lo que muestra la pantalla: lo que sabe el servidor más lo pendiente, sin bajar de cero ni pasar del máximo. */
export function displayCount(serverCount: number, pending: PendingOp[], max: number | null): number {
  const raw = serverCount + pending.reduce((s, o) => s + o.delta, 0);
  const capped = max === null ? raw : Math.min(raw, Math.max(max, serverCount));
  return Math.max(0, capped);
}

/** Agrega un toque: se junta con el último pendiente si todavía no se envió (un solo envío por ráfaga de toques). */
export function addTap(pending: PendingOp[], delta: number, newId: () => string): PendingOp[] {
  if (delta === 0) return pending;
  return [...pending, { id: newId(), delta }];
}

/**
 * Prepara lo que se va a enviar: los toques que todavía no se han intentado se juntan en una sola operación; los ya intentados
 * se reenvían tal cual (mismo identificador y misma cantidad, para que el servidor no los cuente dos veces).
 */
export function prepareSend(pending: PendingOp[]): PendingOp[] {
  const tried = pending.filter((o) => o.tried);
  const fresh = pending.filter((o) => !o.tried);
  const delta = fresh.reduce((s, o) => s + o.delta, 0);
  return [...tried, ...(fresh.length && delta !== 0 ? [{ id: fresh[0].id, delta, tried: true }] : [])];
}

/** ¿Se puede tocar «+»? No si ya está en el máximo (mostrado). */
export const canIncrement = (shown: number, max: number | null) => max === null || shown < max;
export const canDecrement = (shown: number) => shown > 0;

/** Nivel del conteo frente al máximo, para colorear: «ok», «cerca» (desde el 90 %) o «tope». */
export function level(shown: number, max: number | null): "ok" | "cerca" | "tope" {
  if (max === null || max <= 0) return "ok";
  if (shown >= max) return "tope";
  return shown / max >= 0.9 ? "cerca" : "ok";
}

/**
 * Envía la cola en orden. Cada operación sale con su identificador (el servidor ignora las repetidas). Se detiene en el primer fallo de red
 * y devuelve lo que sigue pendiente; un rechazo del servidor (sin permiso, otro día…) descarta esa operación y se informa.
 */
export async function flush(
  pending: PendingOp[],
  send: (op: PendingOp) => Promise<{ ok: true; count: number } | { ok: false; network: boolean; message: string }>,
): Promise<{ remaining: PendingOp[]; serverCount: number | null; rejected: string | null }> {
  let serverCount: number | null = null;
  let rejected: string | null = null;
  const rest = [...pending];
  while (rest.length) {
    const res = await send(rest[0]);
    if (res.ok) { serverCount = res.count; rest.shift(); continue; }
    if (res.network) break;
    rejected = res.message;
    rest.shift();
  }
  return { remaining: rest, serverCount, rejected };
}

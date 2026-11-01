export type RateDecision = { allowed: true } | { allowed: false; retryAfterSeconds: number };

/**
 * Ventana fija en memoria. En Netlify cada instancia de la función tiene la suya: es un
 * suelo, no un límite exacto; el de la plataforma se configura en F7.
 */
export function createRateLimiter({
  max,
  windowMs,
  now = Date.now,
}: {
  max: number;
  windowMs: number;
  now?: () => number;
}): (key: string) => RateDecision {
  const windows = new Map<string, { start: number; count: number }>();
  return (key) => {
    const at = now();
    const current = windows.get(key);
    if (!current || at - current.start >= windowMs) {
      // Las ventanas viejas se tiran al abrir otra: el mapa no crece sin fin.
      for (const [k, w] of windows) if (at - w.start >= windowMs) windows.delete(k);
      windows.set(key, { start: at, count: 1 });
      return { allowed: true };
    }
    if (current.count < max) {
      current.count += 1;
      return { allowed: true };
    }
    return { allowed: false, retryAfterSeconds: Math.ceil((current.start + windowMs - at) / 1000) };
  };
}

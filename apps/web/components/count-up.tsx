"use client";

import { useLayoutEffect, useState } from "react";

function wantsMotion(): boolean {
  return (
    typeof window.matchMedia === "function" &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches &&
    typeof window.requestAnimationFrame === "function"
  );
}

/**
 * Una cifra que sube de 0 a su valor una vez, cuando llega un resultado real (guía §5).
 * `value` es la cifra ya formateada y siempre es lo último que se pinta: la animación solo
 * pasa por números intermedios con los mismos decimales. Sin movimiento, el valor directo.
 * Va dentro de algo con su propio texto accesible: los números intermedios no se anuncian.
 */
export function CountUp({ value, durationMs = 900 }: { value: string; durationMs?: number }) {
  const [shown, setShown] = useState(value);

  useLayoutEffect(() => {
    const target = Number(value);
    if (!Number.isFinite(target) || !wantsMotion()) {
      setShown(value);
      return;
    }
    const decimals = value.split(".")[1]?.length ?? 0;
    const start = performance.now();
    let frame = 0;
    // Con performance.now() y no con la hora que pasa requestAnimationFrame: no todos los
    // entornos usan el mismo reloj, y con otro la cuenta podría no terminar.
    const tick = () => {
      const t = Math.min((performance.now() - start) / durationMs, 1);
      if (t >= 1) {
        setShown(value);
        return;
      }
      setShown((target * (1 - (1 - t) ** 3)).toFixed(decimals));
      frame = requestAnimationFrame(tick);
    };
    setShown((0).toFixed(decimals));
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, durationMs]);

  return <span className="tabular-nums">{shown}</span>;
}

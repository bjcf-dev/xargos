"use client";

import { useEffect, useState } from "react";

const pad = (n: number) => String(n).padStart(2, "0");

/** Lo que queda, como un reloj: "9:41", "0:05" o "1:02:03". Nunca negativo ni NaN. */
export function formatCountdown(ms: number): string {
  const total = Number.isFinite(ms) && ms > 0 ? Math.floor(ms / 1000) : 0;
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

/**
 * Milisegundos hasta `until` (hora absoluta), al segundo. Se para en 0; undefined si no hay hora.
 */
export function useCountdown(
  until: number | undefined,
  now: () => number = Date.now,
): number | undefined {
  const remaining = () => (until === undefined ? undefined : Math.max(0, until - now()));
  const [left, setLeft] = useState(remaining);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `now` es un reloj, no cambia el plazo.
  useEffect(() => {
    setLeft(remaining());
    if (until === undefined || until - now() <= 0) return;
    const timer = setInterval(() => {
      const next = Math.max(0, until - now());
      setLeft(next);
      if (next === 0) clearInterval(timer);
    }, 1_000);
    return () => clearInterval(timer);
  }, [until]);

  return left;
}

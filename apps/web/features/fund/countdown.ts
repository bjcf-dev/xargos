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

/** La hora de un instante ISO, "12:30" (24 h, hora local). undefined si no se puede leer. */
export function formatClock(iso: string, timeZone?: string): string | undefined {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return undefined;
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    ...(timeZone ? { timeZone } : {}),
  }).format(date);
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

"use client";

import { type FocusEvent, type HTMLAttributes, useEffect, useRef, useState } from "react";

export function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

type RegionHandlers = Pick<
  HTMLAttributes<HTMLElement>,
  "onMouseEnter" | "onMouseLeave" | "onPointerDown" | "onFocus" | "onBlur"
>;

/**
 * Contenido que avanza solo, de `count` en bucle, cada `intervalMs` (o lo que dure cada paso). Se puede pausar (botón), se
 * para con el ratón encima o con el foco del teclado dentro (WCAG 2.2.2) y no avanza con
 * movimiento reducido. El foco que llega con un clic no para: si no, un botón que se queda el foco
 * dejaría todo parado. Al reanudar se olvidan también el ratón encima y el foco.
 */
export function useAutoAdvance(
  count: number,
  /** Lo que dura cada paso: el mismo para todos, o uno por paso. */
  intervalMs: number | ((index: number) => number),
  /**
   * pauseOnHover: parar con el ratón encima. Bien en una franja pequeña; mal en una sección grande,
   * donde el ratón se queda mientras se lee y todo parece parado. Por defecto, sí.
   */
  { pauseOnHover = true }: { pauseOnHover?: boolean } = {},
): {
  index: number;
  select: (i: number) => void;
  paused: boolean;
  togglePaused: () => void;
  reduced: boolean;
  running: boolean;
  regionHandlers: RegionHandlers;
} {
  const [index, setIndex] = useState(0);
  const durationOf = (i: number) => (typeof intervalMs === "number" ? intervalMs : intervalMs(i));
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [reduced, setReduced] = useState(false);
  // pointerdown llega antes que focus: así se distingue un clic del teclado.
  const fromPointer = useRef(false);

  // En el cliente: en el servidor no hay matchMedia.
  useEffect(() => setReduced(prefersReducedMotion()), []);

  const running = !paused && !(pauseOnHover && hovered) && !focused && !reduced;

  // Lo que le queda al paso actual. Al reanudar se espera solo lo que faltaba, no un paso entero.
  const remaining = useRef(durationOf(0));

  // Cada paso nuevo (solo o elegido) empieza con el tiempo entero.
  // biome-ignore lint/correctness/useExhaustiveDependencies: se reinicia por el cambio de paso.
  useEffect(() => {
    remaining.current = durationOf(index);
  }, [index]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: cada paso programa el siguiente.
  useEffect(() => {
    if (!running) return;
    const started = Date.now();
    const id = setTimeout(() => setIndex((i) => (i + 1) % count), remaining.current);
    return () => {
      clearTimeout(id);
      remaining.current = Math.max(0, remaining.current - (Date.now() - started));
    };
  }, [running, index, count]);

  return {
    index,
    select: setIndex,
    paused,
    togglePaused: () => {
      if (paused) {
        setHovered(false);
        setFocused(false);
      }
      setPaused(!paused);
    },
    reduced,
    running,
    regionHandlers: {
      onMouseEnter: () => setHovered(true),
      onMouseLeave: () => setHovered(false),
      onPointerDown: () => {
        fromPointer.current = true;
      },
      onFocus: () => {
        if (fromPointer.current) {
          fromPointer.current = false;
          return;
        }
        setFocused(true);
      },
      onBlur: (event: FocusEvent<HTMLElement>) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      },
    },
  };
}

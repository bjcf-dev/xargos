"use client";

import {
  CoinsIcon,
  KeyRoundIcon,
  NetworkIcon,
  PauseIcon,
  PlayIcon,
  ShieldCheckIcon,
} from "lucide-react";
import type { ComponentType } from "react";
import { Button } from "@/components/ui/button";
import { useAutoAdvance } from "@/lib/use-auto-advance";
import { cn } from "@/lib/utils";

export const TICKER_INTERVAL_MS = 3500;

type Guarantee = {
  text: string;
  /** Una línea que la explica; sin cifras escritas a mano. */
  detail?: string;
  Icon: ComponentType<{ className?: string }>;
};

/** Lo que el producto cumple de verdad (la franja de garantías de la guía, sin cifras inventadas). */
const GUARANTEES: readonly Guarantee[] = [
  {
    Icon: CoinsIcon,
    text: "Paid per request with x402",
    detail: "The agent pays inside the HTTP call: no account and no API key.",
  },
  {
    Icon: ShieldCheckIcon,
    text: "All or nothing, enforced on-chain",
    detail: "Below the guaranteed minimum, Solana reverts the whole transaction.",
  },
  {
    Icon: KeyRoundIcon,
    text: "Signed by the agent, never by xARGOS",
    detail: "xARGOS builds the transaction; only the agent's key can sign it.",
  },
  {
    Icon: NetworkIcon,
    text: "Solana devnet, no custody",
    detail: "The agent's funds never pass through xARGOS.",
  },
];

/**
 * Las garantías de una en una, como diapositivas. Contenido que se mueve solo: se puede pausar
 * (botón), se para al pasar el ratón o con el foco del teclado (WCAG 2.2.2) y no avanza solo con
 * movimiento reducido. Cuando está parado, el lector de pantalla anuncia cada cambio.
 * El foco que llega con un clic no para: el botón se queda el foco y, si no, "reanudar" no
 * reanudaba. Pulsar reanudar quita también la pausa del ratón encima.
 */
export function GuaranteeTicker({ items = GUARANTEES }: { items?: readonly Guarantee[] }) {
  const { index, select, paused, togglePaused, running, regionHandlers } = useAutoAdvance(
    items.length,
    TICKER_INTERVAL_MS,
  );

  const current = items[index] ?? items[0];
  if (!current) return null;
  const { Icon, text, detail } = current;

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Guarantees"
      // Encapsulada como las tarjetas de la referencia: borde, degradado sutil y un brillo turquesa.
      className="relative isolate flex items-center gap-4 overflow-hidden rounded-xl border bg-linear-to-br from-card to-primary-soft/40 px-5 py-4 shadow-sm"
      {...regionHandlers}
    >
      <div
        aria-hidden
        className="absolute -right-16 -bottom-20 -z-10 size-56 rounded-full bg-primary/15 blur-3xl"
      />
      <div className="min-h-12 min-w-0 flex-1" aria-live={running ? "off" : "polite"}>
        {/* biome-ignore lint/a11y/useSemanticElements: patrón de carrusel de WAI-ARIA (diapositiva = group). */}
        <div
          key={index}
          role="group"
          aria-roledescription="slide"
          aria-label={`${index + 1} of ${items.length}`}
          className="flex animate-in items-center gap-3 duration-500 fade-in slide-in-from-bottom-3"
        >
          <span className="grid size-11 shrink-0 place-items-center rounded-lg border border-primary/30 bg-primary-soft text-primary">
            <Icon aria-hidden className="size-5" />
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="text-base font-semibold sm:text-lg">{text}</span>
            {detail ? <span className="text-sm text-muted-foreground">{detail}</span> : null}
          </span>
        </div>
      </div>
      <div className="flex shrink-0 items-center">
        {items.map((item, i) => (
          <button
            key={item.text}
            type="button"
            aria-label={`Show guarantee ${i + 1} of ${items.length}`}
            aria-current={i === index ? "true" : undefined}
            onClick={() => select(i)}
            className="grid size-6 place-items-center rounded-full"
          >
            <span
              className={cn(
                "h-1.5 rounded-full transition-all duration-300",
                i === index ? "w-4 bg-primary" : "w-1.5 bg-muted-foreground/40",
              )}
            />
          </button>
        ))}
        <Button
          variant="ghost"
          size="icon-sm"
          className="ml-1"
          aria-label={paused ? "Play guarantees" : "Pause guarantees"}
          onClick={togglePaused}
        >
          {paused ? <PlayIcon /> : <PauseIcon />}
        </Button>
      </div>
      {/* Cuánto falta para la siguiente: se reinicia en cada diapositiva y se para con la franja. */}
      <span
        key={`progress-${index}`}
        aria-hidden
        className={cn(
          "absolute bottom-0 left-0 h-px animate-ticker bg-primary",
          !running && "[animation-play-state:paused]",
        )}
      />
    </section>
  );
}

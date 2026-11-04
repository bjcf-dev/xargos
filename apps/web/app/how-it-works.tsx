"use client";

import { CircleDotIcon, PauseIcon, PlayIcon } from "lucide-react";
import { Eyebrow } from "@/components/eyebrow";
import { Button } from "@/components/ui/button";
import type { X402StepState } from "@/features/demo/copy";
import { StepIcon } from "@/features/demo/step-icon";
import { useAutoAdvance } from "@/lib/use-auto-advance";
import { cn } from "@/lib/utils";

export const HOW_IT_WORKS_INTERVAL_MS = 3500;
/** Lo que se ve el tercer check (los tres pasos hechos) antes de volver a empezar. */
export const HOW_IT_WORKS_DONE_MS = 1000;

/** Los tres pasos y su fila en la miniatura de la demo. Sin cifras: el mínimo depende de cada build. */
const STEPS = [
  {
    title: "The agent pays",
    detail: "x402 inside the HTTP call: no account, no API key.",
    demo: "Paid with x402",
  },
  {
    title: "Gets one transaction",
    detail: "All the recipe's steps, ready to sign. We never sign for it.",
    demo: "Transaction built",
  },
  {
    title: "The guard checks",
    detail: "Below the minimum, Solana reverts everything. Only the network fee is spent.",
    demo: "Guard · minimum USDC",
  },
] as const;

/**
 * "How it works": tres pasos que se encienden uno a uno, con una miniatura de la demo que avanza
 * con ellos. Cada paso se puede elegir y el avance se pausa con el botón o con el foco del teclado
 * (WCAG 2.2.2), no con el ratón encima; con movimiento
 * reducido, todo encendido y quieto. El avance es decorativo: no se anuncia.
 */
export function HowItWorks() {
  const { index, select, paused, togglePaused, reduced, running, regionHandlers } = useAutoAdvance(
    // Un paso más al final: los tres hechos, un segundo, antes de volver al primero.
    STEPS.length + 1,
    (i) => (i === STEPS.length ? HOW_IT_WORKS_DONE_MS : HOW_IT_WORKS_INTERVAL_MS),
    // Es donde se pone el ratón para mirarla: con el ratón no se para (sí con el botón y el teclado).
    { pauseOnHover: false },
  );

  // En la fase final sigue encendido el último paso.
  const current = Math.min(index, STEPS.length - 1);

  const rowState = (i: number): X402StepState => {
    if (reduced || i < index) return "done";
    return i === index ? "active" : "pending";
  };

  return (
    <section
      id="how-it-works"
      aria-labelledby="how-it-works-title"
      className="grid scroll-mt-24 items-center gap-8 md:grid-cols-[0.9fr_1.1fr] md:gap-10"
      {...regionHandlers}
    >
      <div className="flex flex-col gap-4">
        <Eyebrow>How it works</Eyebrow>
        <h2
          id="how-it-works-title"
          className="font-display text-4xl leading-none font-light tracking-tight sm:text-5xl"
        >
          Three steps. One guarantee.
        </h2>
        <ol className="flex flex-col gap-2">
          {STEPS.map((step, i) => {
            const on = reduced || i === current;
            return (
              <li key={step.title}>
                <button
                  type="button"
                  data-state={on ? "on" : "off"}
                  aria-current={!reduced && i === current ? "step" : undefined}
                  onClick={() => select(i)}
                  className={cn(
                    "flex w-full flex-col gap-0.5 border-l-2 py-1.5 pl-4 text-left transition-colors duration-300",
                    on
                      ? "border-brand-gold text-foreground"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  <b className="text-base font-semibold">
                    {i + 1} · {step.title}
                  </b>{" "}
                  <small className="text-sm text-muted-foreground">{step.detail}</small>
                </button>
              </li>
            );
          })}
        </ol>
        {reduced ? null : (
          <Button
            variant="ghost"
            size="sm"
            className="self-start"
            aria-label={paused ? "Play steps" : "Pause steps"}
            onClick={togglePaused}
          >
            {paused ? <PlayIcon /> : <PauseIcon />}
            {paused ? "Play" : "Pause"}
          </Button>
        )}
      </div>

      {/* Miniatura de la demo: decorativa, lo mismo que los pasos de la izquierda. */}
      <div
        aria-hidden
        className="overflow-hidden rounded-xl border bg-card shadow-[0_20px_50px_-20px_rgb(0_0_0/0.45)]"
      >
        <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-2 font-mono text-[0.7rem] text-muted-foreground">
          <span className="flex gap-1">
            <span className="size-2 rounded-full bg-muted-foreground/40" />
            <span className="size-2 rounded-full bg-muted-foreground/40" />
            <span className="size-2 rounded-full bg-muted-foreground/40" />
          </span>
          xargos / demo
        </div>
        <ul className="flex flex-col gap-2 p-4">
          {STEPS.map((step, i) => {
            const state = rowState(i);
            return (
              <li
                key={step.demo}
                data-row-state={state}
                className={cn(
                  "flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors duration-300",
                  state === "active" && "border-primary/60 bg-primary-soft/40",
                  state === "pending" && "text-muted-foreground",
                )}
              >
                {step.demo}
                {/* En pausa (botón, ratón o foco) no gira nada: el paso activo, con un icono quieto. */}
                {state === "active" && !running ? (
                  <CircleDotIcon className="size-4 shrink-0 text-primary" />
                ) : (
                  <StepIcon state={state} />
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

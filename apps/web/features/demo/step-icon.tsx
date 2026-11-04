import { CircleDashedIcon, CircleIcon } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import type { X402StepState } from "./copy";

/** Check que se dibuja en el color de éxito: solo aparece cuando un paso acaba de verdad. */
export function DoneIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
      className={cn("size-4 shrink-0 text-success", className)}
    >
      <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="m5 8.2 2 2 4-4.4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray="14"
        className="animate-draw-check"
      />
    </svg>
  );
}

/** Icono de un paso (setup del agente y x402): hecho, en curso, pendiente o simulado. */
export function StepIcon({ state }: { state: X402StepState }) {
  if (state === "done") return <DoneIcon />;
  if (state === "active") return <Spinner aria-hidden className="text-primary" />;
  if (state === "simulated") {
    return <CircleDashedIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />;
  }
  return <CircleIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />;
}
